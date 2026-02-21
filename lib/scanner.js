/* eslint-disable no-console */
// Code based on https://github.com/StephanJoubert/home_assistant_solarman
// From scanner.py

// Send the broadcast message every 30 seconds until a valid response is detected

'use strict';

const dgram = require('dgram');

class InverterScanner
{

	constructor(homey, homeyIP, scannerOptions = {})
	{
		this._homey = homey;
		this._homeyIP = homeyIP;
		this._ipaddress = null;
		this._serial = null;
		this._mac = null;
		this._scanning = false;
		this._scannerSocket = null;
		this._scannerTimer = null;
		this._retryTimer = null;
		this._retryCount = 0;
		this._maxRetries = Number.isInteger(scannerOptions.maxRetries) && (scannerOptions.maxRetries >= 0) ? scannerOptions.maxRetries : 10;
		this._retryBaseDelayMs = Number.isInteger(scannerOptions.retryBaseDelayMs) && (scannerOptions.retryBaseDelayMs > 0) ? scannerOptions.retryBaseDelayMs : 5000;
		this._retryMaxDelayMs = Number.isInteger(scannerOptions.retryMaxDelayMs) && (scannerOptions.retryMaxDelayMs > 0) ? scannerOptions.retryMaxDelayMs : 60000;
		this.port = 48899;
		return this;
	}

	_resetRetryState()
	{
		if (this._retryTimer)
		{
			this._homey.clearTimeout(this._retryTimer);
			this._retryTimer = null;
		}

		this._retryCount = 0;
	}

	_cleanupScanner()
	{
		if (this._scannerTimer)
		{
			this._homey.clearInterval(this._scannerTimer);
			this._scannerTimer = null;
		}

		if (this._scannerSocket)
		{
			try
			{
				this._scannerSocket.close();
			}
			catch (err)
			{
				// ignore close errors
			}

			this._scannerSocket = null;
		}

		this._scanning = false;
	}

	_scheduleRetry(callback)
	{
		if (this._retryTimer)
		{
			return;
		}

		if (this._retryCount >= this._maxRetries)
		{
			console.log(`CLIENT RETRY LIMIT REACHED: ${this._retryCount}/${this._maxRetries}`);
			return;
		}

		const delay = Math.min(this._retryBaseDelayMs * (2 ** this._retryCount), this._retryMaxDelayMs);
		this._retryCount += 1;
		console.log(`CLIENT RETRY ${this._retryCount}/${this._maxRetries} in ${delay}ms`);

		this._retryTimer = this._homey.setTimeout(() =>
		{
			this._retryTimer = null;
			this._discover_inverters(callback);
		}, delay);
	}

	_discover_inverters(callback)
	{
		if (this._scanning)
		{
			return;
		}

		this._scanning = true;
		const request = 'WIFIKIT-214028-READ';
		try
		{
			const socket = dgram.createSocket('udp4');
			const __this = this;
			this._scannerSocket = socket;

			socket.on('listening', () =>
			{
				socket.setBroadcast(true);
				__this._scannerTimer = __this._homey.setInterval(() =>
				{
					try
					{
						socket.send(request, 0, request.length, this.port, '255.255.255.255');
					}
					catch (err)
					{
						console.log('CLIENT SEND ERROR: ', err);
						__this._cleanupScanner();
						__this._scheduleRetry(callback);
					}
				}, 5000);
			});

			socket.on('message', (buffer, remote) =>
			{
				if (remote.address !== __this._homeyIP)
				{
					const message = buffer.toString();
					// console.log('CLIENT RECEIVED: ', remote, message);
					const a = message.split(',');
					if (a.length === 3)
					{
						__this._cleanupScanner();
						__this._resetRetryState();
						__this._ipaddress = a[0];
						__this._mac = a[1];
						__this._serial = parseInt(a[2], 10);
						// console.log('CLIENT INFO: ', __this._ipaddress, __this._mac, __this._serial);
						if (typeof callback === 'function')
						{
							try
							{
								Promise.resolve(callback(__this._ipaddress, __this._serial)).catch((err) =>
								{
									console.log('CLIENT CALLBACK ERROR: ', err);
								});
							}
							catch (err)
							{
								console.log('CLIENT CALLBACK ERROR: ', err);
							}
						}
					}
				}
			});
			socket.on('error', (error) =>
			{
				console.log('CLIENT ERROR: ', error);
				__this._cleanupScanner();
				__this._scheduleRetry(callback);
			});

			socket.bind(this.port);
		}
		catch (err)
		{
			console.log('CLIENT START ERROR: ', err);
			this._cleanupScanner();
			this._scheduleRetry(callback);
		}
	}

	async startScanning(callback)
	{
		this._resetRetryState();
		this._discover_inverters(callback);
	}

	get_ipaddress()
	{
		return this._ipaddress;
	}

	get_serialno()
	{
		return this._serial;
	}

}

module.exports = InverterScanner;
