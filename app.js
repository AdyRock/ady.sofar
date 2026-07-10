/* jslint node: true */

'use strict';

if (process.env.DEBUG === '1')
{
	// eslint-disable-next-line node/no-unsupported-features/node-builtins, global-require
	require('inspector').open(9229, '0.0.0.0', true);
}

const Hook = require('console-hook');

const Homey = require('homey');
const nodemailer = require('nodemailer');
const fs = require('node:fs');

const Scanner = require('./lib/scanner');
const Sensor = require('./lib/sensor');

class MyApp extends Homey.App
{

	/**
	 * onInit is called when the app is initialized.
	 */
	async onInit()
	{
		// Hook into the console.log so we can log to the Homey log
		this.myHook = Hook().attach((method, args) =>
		{
			// method is the console[method] string
			// args is the arguments object passed to console[method]
			let logMessage = '';
			const argsArray = Array.from(args);
			argsArray.forEach((element) =>
			{
				logMessage += this.varToString(element);
				logMessage += ' ';
			});
			this.updateLog(logMessage, method === 'log', true);
		});

		this.log('Solarman has been initialized');
		this.localPollingEnabled = false;
		this.diagLog = '';

		if (process.env.DEBUG === '1')
		{
			this.homey.settings.set('debugMode', true);
		}
		else
		{
			this.homey.settings.set('debugMode', false);
		}

		this.scannerFoundADevice = this.scannerFoundADevice.bind(this);
		this.getInverterData = this.getInverterData.bind(this);
		this.restartScannerIfNoData = this.restartScannerIfNoData.bind(this);
		this.tryRestartScanner = this.tryRestartScanner.bind(this);

		this.lastValidInverterDataAt = Date.now();
		this.lastScannerRestartAt = 0;
		this.noDataRestartMs = 5 * 60 * 1000;
		this.scannerRestartCooldownMs = 60 * 1000;
		this.noInverterScanCooldownMs = 60 * 1000;
		this.pollingIntervalMs = this.getPollingIntervalMs();

		// Callback for app settings changed
		// this.homey.settings.on('set', async function settingChanged(setting) {});

		this.lanSensors = [];
		this.lanSensorTimer = null;

		if (this.homey.settings.get('manualSensors'))
		{
			this.homey.app.updateLog('Registering manual sensors from settings', 0);
			const manualSensors = this.homey.settings.get('manualSensors');
			for (const sensorData of manualSensors)
			{
				await this.registerSensor(sensorData.ip, sensorData.serial);
			}
		}

		try
		{
			this.homeyIP = await this.homey.cloud.getLocalAddress();
			if (this.homeyIP)
			{
				// Remove the port number
				const ip = this.homeyIP.split(':');

				this.scanner = new Scanner(this.homey, ip[0]);
				this.homey.app.updateLog('Searching for inverters on the LAN', 0);

				this.scanner.startScanning(this.scannerFoundADevice);
			}
		}
		catch (err)
		{
			// Homey cloud or Bridge so no LAN access
			this.homeyIP = null;
			this.scanner = null;
		}

		const widget = this.homey.dashboards.getWidget('energy');
		widget.registerSettingAutocompleteListener('solarDevices', async (query, settings) =>
		{
			const devices = await this.getSolarDevices({});
			return devices;
		});

		widget.registerSettingAutocompleteListener('batteryDevices', async (query, settings) =>
		{
			const devices = await this.getBatteryDevices({});
			return devices;
		});

		widget.registerSettingAutocompleteListener('gridDevices', async (query, settings) =>
		{
			const devices = await this.getGridDevices({});
			return devices;
		});

		widget.registerSettingAutocompleteListener('homeDevices', async (query, settings) =>
		{
			const devices = await this.getHomeDevices({});
			return devices;
		});

		// Callback for app settings changed
		this.homey.settings.on('set', async (setting) =>
		{
			this.homey.app.updateLog(`Setting ${setting} has changed.`, 3);
			if (setting === 'manualSensors')
			{
				if (this.homey.settings.get('manualSensors'))
				{
					this.homey.app.updateLog('Registering manual sensors from settings', 0);
					const manualSensors = this.homey.settings.get('manualSensors');
					for (const sensorData of manualSensors)
					{
						this.registerSensor(sensorData.ip, sensorData.serial);
					}
				}
			}

			if (setting === 'pollingIntervalSeconds')
			{
				this.pollingIntervalMs = this.getPollingIntervalMs();
				this.updateLog(`Updated polling interval to ${this.pollingIntervalMs}ms`, 0);
			}

			if (setting === 'modbusSlaveId')
			{
				const slaveId = this.getModbusSlaveId();
				for (const sensor of this.lanSensors)
				{
					sensor.setSlaveId(slaveId);
				}
				this.updateLog(`Updated Modbus slave ID to ${slaveId}`, 0);
			}
		});

		this.homey.app.updateLog('************** App has initialised. ***************');
	}

	async startLocalFetch()
	{
		if (!this.localPollingEnabled)
		{
			this.localPollingEnabled = true;
			this.getInverterData();
		}
	}

	async scannerFoundADevice(ip, serial)
	{
		this.updateLog(`Found Inverter: IP: ${ip}, S.No: ${serial}`, 0);
		await this.registerSensor(ip, serial);

		if (this.localPollingEnabled && (this.lanSensorTimer === null))
		{
			this.lanSensorTimer = this.homey.setTimeout(async () =>
			{
				this.getInverterData();
			}, 1000);
		}
	}

	async getInverterData()
	{
		if (this.localPollingEnabled)
		{
			try
			{
				this.updateLog('Get Data');

				// make sure we have a valid inverter
				if (this.lanSensors.length === 0)
				{
					this.updateLog('No inverters found', 0);

					if (this.scanner)
					{
						this.tryRestartScanner('Restarting inverter scan because no inverters are currently registered', this.noInverterScanCooldownMs);
					}

					return;
				}

				// Loop through all the inverters and get the data
				for (const sensor of this.lanSensors)
				{
					const result = await sensor.getStatistics();

					if (result !== null)
					{
						this.lastValidInverterDataAt = Date.now();
					}

					if ((result !== null) && (result.Grid_Frequency !== 0))
					{
						// set gridVoltage to the first available of Grid_Voltage, GridPVoltage1, GridPVoltage2, GridPVoltage3 for backwards compatibility with older versions of the app and devices that don't have all 3 phases
						const gridVoltage = result.Grid_Voltage || result.Grid_Voltage1 || result.Grid_Voltage2 || result.Grid_Voltage3 || result.Grid_Voltage_L1 || result.Grid_Voltage_L2 || result.Grid_Voltage_L3;
						if (gridVoltage)
						{
							const serial = sensor.getSerial();
							this.updateLog(`Inverter data: : ${serial}, ${this.varToString(result)}`);

							const drivers = this.homey.drivers.getDrivers();
							for (const driver of Object.values(drivers))
							{
								const devices = driver.getDevices();
								for (const device of Object.values(devices))
								{
									if (device.updateLanDeviceValues)
									{
										device.updateLanDeviceValues(serial, result);
									}
								}
							}
						}
						else
						{
							const serial = sensor.getSerial();
							this.updateLog(`Inverter data: : ${serial}, ${this.varToString(result)}`);
							this.updateLog(`Missing one or more of Frequency = ${result.Grid_Frequency}, Grid_Voltage = ${gridVoltage}`, 0);
						}
					}
					else
					{
						this.updateLog('No Data');
					}
				}
			}
			catch (err)
			{
				this.updateLog(`Error getting inverter data: ${err.message}`);
			}
			finally
			{
				this.restartScannerIfNoData();

				// Always reschedule the timer
				this.lanSensorTimer = this.homey.setTimeout(async () =>
				{
					this.getInverterData();
				}, this.pollingIntervalMs);
			}
		}
	}

	getPollingIntervalMs()
	{
		const defaultSeconds = 15;
		const minSeconds = 10;
		const maxSeconds = 3600;

		const rawSetting = this.homey.settings.get('pollingIntervalSeconds');
		let pollingIntervalSeconds = Number(rawSetting);

		if (!Number.isFinite(pollingIntervalSeconds))
		{
			pollingIntervalSeconds = defaultSeconds;
		}

		pollingIntervalSeconds = Math.round(pollingIntervalSeconds);
		pollingIntervalSeconds = Math.max(minSeconds, Math.min(maxSeconds, pollingIntervalSeconds));

		if (pollingIntervalSeconds !== rawSetting)
		{
			this.homey.settings.set('pollingIntervalSeconds', pollingIntervalSeconds);
		}

		return pollingIntervalSeconds * 1000;
	}

	getModbusSlaveId()
	{
		const defaultSlaveId = 1;
		const minSlaveId = 1;
		const maxSlaveId = 247;

		const rawSetting = this.homey.settings.get('modbusSlaveId');
		let slaveId = Number(rawSetting);

		if (!Number.isFinite(slaveId))
		{
			slaveId = defaultSlaveId;
		}

		slaveId = Math.round(slaveId);
		slaveId = Math.max(minSlaveId, Math.min(maxSlaveId, slaveId));

		if (slaveId !== rawSetting)
		{
			this.homey.settings.set('modbusSlaveId', slaveId);
		}

		return slaveId;
	}

	tryRestartScanner(reason, cooldownMs = this.scannerRestartCooldownMs)
	{
		if (!this.scanner)
		{
			return false;
		}

		const now = Date.now();
		const effectiveCooldownMs = Math.max(this.scannerRestartCooldownMs, cooldownMs);
		if ((now - this.lastScannerRestartAt) < effectiveCooldownMs)
		{
			const remainingMs = effectiveCooldownMs - (now - this.lastScannerRestartAt);
			this.updateLog(`Scanner restart skipped due to cooldown (${remainingMs}ms remaining). Requested reason: ${reason}`);
			return false;
		}

		this.lastScannerRestartAt = now;
		this.updateLog(reason, 0);

		try
		{
			this.scanner.startScanning(this.scannerFoundADevice);
			return true;
		}
		catch (err)
		{
			this.updateLog(`Error restarting scanner: ${err.message}`, 0);
			return false;
		}
	}

	restartScannerIfNoData()
	{
		if (!this.scanner)
		{
			return;
		}

		const now = Date.now();
		if ((now - this.lastValidInverterDataAt) < this.noDataRestartMs)
		{
			return;
		}

		this.tryRestartScanner('No inverter data received for 5 minutes, restarting scanner', this.scannerRestartCooldownMs);
	}

	async registerSensor(ip, serial)
	{
		const modbusSlaveId = this.getModbusSlaveId();
		this.updateLog(`Using Modbus slave ID ${modbusSlaveId} when registering sensor ${serial}`, 0);

		for (const sensor of this.lanSensors)
		{
			// Check if this one already registered
			if (sensor.getSerial() === serial)
			{
				// Yep, found it so update the IP just incase it changed
				sensor.setHost(ip);
				sensor.setSlaveId(modbusSlaveId);
				return;
			}
		}

		// Try to read the grid frequency address
		this.updateLog('Checking register 14 for grid frequency:', 0);
		let sensor = await this.checkSensor(ip, serial, 14, 'sofar_lsw3');
		let profileName = null;

		// If sofar_lsw3 matched, also check if this could be a sun3p inverter
		// sun3p inverters may have a value at register 14 that looks like a valid frequency,
		// but their actual grid frequency is at register 609
		if (sensor !== null)
		{
			profileName = 'sofar_lsw3';
			this.updateLog('Register 14 matched sofar_lsw3. Checking register 609 to verify it is not a sun3p inverter:', 0);
			const sun3pSensor = await this.checkSensor(ip, serial, 609, 'sun3p');
			if (sun3pSensor !== null)
			{
				this.updateLog('Register 609 also matched sun3p. Using sun3p profile (more specific match).', 0);
				sensor = sun3pSensor;
				profileName = 'sun3p';
			}
			else
			{
				this.updateLog('Register 609 did not match sun3p. Confirming sofar_lsw3 profile.', 0);
			}
		}

		if (sensor === null)
		{
			this.updateLog('Returned null.\n\nChecking register 1156 for grid frequency:', 0);
			sensor = await this.checkSensor(ip, serial, 1156, 'sofar_g3hyd');
			if (sensor !== null) profileName = 'sofar_g3hyd';
		}
		if (sensor === null)
		{
			this.updateLog('Returned null.\n\nChecking register 524 for grid frequency:', 0);
			sensor = await this.checkSensor(ip, serial, 524, 'sofar_hy_es');
			if (sensor !== null) profileName = 'sofar_hy_es';
		}
		if (sensor === null)
		{
			this.updateLog('Returned null.\n\nChecking register 33282 for grid frequency:', 0);
			sensor = await this.checkSensor(ip, serial, 33282, 'solis_hybrid');
			if (sensor !== null) profileName = 'solis_hybrid';
		}
		if (sensor === null)
		{
			this.updateLog('Returned null.\n\nChecking register 609 for grid frequency:', 0);
			sensor = await this.checkSensor(ip, serial, 609, 'sun3p');
			if (sensor !== null) profileName = 'sun3p';
		}
		if (sensor === null)
		{
			this.updateLog('Returned null.\n\nChecking register 619 for grid frequency using FC4:', 0);
			sensor = await this.checkSensor(ip, serial, 619, 'sofar_ktlx_g', 4);
			if (sensor !== null) profileName = 'sofar_ktlx_g';
		}
		if (sensor === null)
		{
			this.updateLog('Returned null.\n\nChecking register 552 for grid frequency:', 0);
			sensor = await this.checkSensor(ip, serial, 552, 'deye_sg04lp3');
			if (sensor !== null) profileName = 'deye_sg04lp3';
		}
		if (sensor === null)
		{
			this.updateLog('Returned null.\n\nChecking register 79 for grid frequency:', 0);
			sensor = await this.checkSensor(ip, serial, 79, 'deye_sg04lp3');
			if (sensor !== null) profileName = 'deye_sg04lp3';
		}
		if (sensor === null)
		{
			this.updateLog('Returned null.\n\nNo suitable inverters found', 0);
		}
		else
		{
			this.updateLog(`Successfully registered inverter with profile: ${profileName}`, 0);
			this.lanSensors.push(sensor);
		}
	}

	async checkSensor(ip, serial, register, lookupFile, mbFunctionCode = 3)
	{
		const sensor = new Sensor(serial, ip, 8899, this.getModbusSlaveId(), lookupFile);
		try
		{
			const frequency = await sensor.getRegisterValue(register, mbFunctionCode);
			this.updateLog(`Register ${register} (${lookupFile}): Raw value = ${frequency}, Hz = ${frequency / 100}`, 0);

			if ((frequency < 4900) || (frequency > 6500))
			{
				this.updateLog(`Frequency ${frequency / 100} is not valid (out of range 49-65 Hz)`, 0);
				return null;
			}
			if ((frequency > 5100) && (frequency < 5700))
			{
				this.updateLog(`Frequency ${frequency / 100} is not valid (in excluded range 51-57 Hz)`, 0);
				return null;
			}
			this.updateLog(`Frequency ${frequency / 100} is good - MATCHED ${lookupFile}`, 0);
		}
		catch (err)
		{
			const expectedProbeMissErrors = [
				'Invalid MODBUS packet',
				'Invalid V5 checksum',
				'Incomplete MODBUS packet',
				'Invalid V5 packet start',
				'Empty MODBUS packet',
				`No data returned for register ${register}`,
			];

			if (expectedProbeMissErrors.includes(err.message))
			{
				this.updateLog(`Register ${register} (${lookupFile}): No probe match (${err.message})`, 1);
			}
			else
			{
				this.updateLog(`Register ${register} (${lookupFile}): Error reading - ${err.message}`, 0);
			}
			return null;
		}

		return sensor;
	}

	getDiscoveredInverters()
	{
		return this.lanSensors;
	}

	getInverter(serial)
	{
		if (this.lanSensors.length > 0)
		{
			for (const inverter of this.lanSensors)
			{
				if (inverter.inverter_sn === serial)
				{
					return inverter;
				}
			}
		}

		// Check manual sensors from settings
		if (this.homey.settings.get('manualSensors'))
		{
			const manualSensors = this.homey.settings.get('manualSensors');
			for (const sensorData of manualSensors)
			{
				if (sensorData.serial === serial)
				{
					return new Sensor(sensorData.serial, sensorData.ip, 8899, this.getModbusSlaveId(), null);
				}
			}
		}

		return null;
	}

	StopReadingRegisters()
	{
		this.stopReadingRegisters = true;
	}

	async GetMultipleRegisterValues(register, count, serial)
	{
		this.loggingRegisters = true;
		this.stopReadingRegisters = false;
		let fileData = '';

		// eslint-disable-next-line radix
		let registerNumber = parseInt(register);
		for (let i = 0; i < count; i++)
		{
			try
			{
				const result = await this.GetRegisterValue(registerNumber, serial);
				const formattedResult = `${registerNumber} = ${result}\n`;
				fileData += formattedResult;
				this.homey.api.realtime('ady.sofar.regupdated', { result: formattedResult });
			}
			catch (err)
			{
				const formattedResult = `${registerNumber} = ${err.message}\n`;
				fileData += formattedResult;
				this.homey.api.realtime('ady.sofar.regupdated', { result: formattedResult });
			}
			if (this.stopReadingRegisters)
			{
				break;
			}

			if ((i % 10) === 0)
			{
				// write to the log every 10 registers to a file in the /userdata/ folder
				try
				{
					fs.appendFileSync('/userdata/register.log', fileData);
				}
				catch (err)
				{
					this.updateLog(`Error writing to file: ${err.message}`, 0);
				}
				fileData = '';
			}
			registerNumber++;
		}

		if (fileData.length > 0)
		{
			try
			{
				fs.appendFileSync('/userdata/register.log', fileData);
			}
			catch (err)
			{
				this.updateLog(`Error writing to file: ${err.message}`, 0);
			}
		}

		this.homey.api.realtime('ady.sofar.regupdated', { result: 'Finished' });
		this.loggingRegisters = false;
	}

	getRegisterLogging()
	{
		return this.loggingRegisters;
	}

	getRegisterLog()
	{
		try
		{
			return fs.readFileSync('/userdata/register.log', 'utf8');
		}
		catch (err)
		{
			// this.updateLog(`Error reading file: ${err.message}`, 0);
		}
		return '';
	}

	clearRegisterLog()
	{
		fs.unlinkSync('/userdata/register.log');
	}

	async GetRegisterValue(register, serial = null)
	{
		const registerNumber = parseInt(register, 10);

		// If a serial number is provided, try to get the value from that specific inverter
		if (serial)
		{
			const inverter = this.getInverter(serial);
			if (inverter)
			{
				return inverter.getRegisterValue(registerNumber, registerNumber, 3);
			}
		}

		if (this.lanSensors.length > 0)
		{
			return this.lanSensors[0].getRegisterValue(registerNumber, registerNumber, 3);
		}

		if (this.homey.settings.get('manualSensors'))
		{
			const manualSensors = this.homey.settings.get('manualSensors');
			for (const sensorData of manualSensors)
			{
				const sensor = new Sensor(sensorData.serial, sensorData.ip, 8899, this.getModbusSlaveId(), null);
				return sensor.getRegisterValue(registerNumber, registerNumber, 3);
			}
		}

		return 'No inverter available';
	}

	//    async onUninit() {}

	hashCode(s)
	{
		let h = 0;
		for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
		return h;
	}

	varToString(source)
	{
		try
		{
			if (source === null)
			{
				return 'null';
			}
			if (source === undefined)
			{
				return 'undefined';
			}
			if (source instanceof Error)
			{
				const stack = source.stack.replace('/\\n/g', '\n');
				return `${source.message}\n${stack}`;
			}
			if (typeof (source) === 'object')
			{
				const getCircularReplacer = () =>
				{
					const seen = new WeakSet();
					return (key, value) =>
					{
						if (typeof value === 'object' && value !== null)
						{
							if (seen.has(value))
							{
								return '';
							}
							seen.add(value);
						}
						return value;
					};
				};

				return JSON.stringify(source, getCircularReplacer(), 2);
			}
			if (typeof (source) === 'string')
			{
				return source;
			}
		}
		catch (err)
		{
			this.homey.app.updateLog(`VarToString Error: ${err}`, 0);
		}

		return source.toString();
	}

	updateLog(newMessage, errorLevel = 1, fromConsole = false)
	{
		if (!fromConsole && errorLevel === 0)
		{
			this.error(newMessage);
		}

		if ((errorLevel === 0) || (((errorLevel & 1) === 1) && this.homey.settings.get('logEnabled')) || (((errorLevel & 2) === 2) && this.homey.settings.get('logNetEnabled')))
		{
			try
			{
				const nowTime = new Date(Date.now());

				this.diagLog += '\r\n* ';
				this.diagLog += nowTime.toJSON();
				this.diagLog += '\r\n';

				this.diagLog += newMessage;
				this.diagLog += '\r\n';
				if (this.diagLog.length > 60000)
				{
					this.diagLog = this.diagLog.substr(this.diagLog.length - 60000);
				}

				if (this.homeyIP)
				{
					this.homey.api.realtime('ady.sofar.logupdated', { log: this.diagLog });
				}
			}
			catch (err)
			{
				this.log(err);
			}
		}
	}

	// Send the log to the developer (not applicable to Homey cloud)
	async sendLog(body)
	{
		let tries = 5;

		let logData;
		if (body.logType === 'diag')
		{
			logData = this.diagLog;
		}

		while (tries-- > 0)
		{
			try
			{
				// create reusable transporter object using the default SMTP transport
				const transporter = nodemailer.createTransport(
					{
						host: Homey.env.MAIL_HOST, // Homey.env.MAIL_HOST,
						port: 465,
						ignoreTLS: false,
						secure: true, // true for 465, false for other ports
						auth:
						{
							user: Homey.env.MAIL_USER, // generated ethereal user
							pass: Homey.env.MAIL_SECRET, // generated ethereal password
						},
						tls:
						{
							// do not fail on invalid certs
							rejectUnauthorized: false,
						},
					},
				);

				// send mail with defined transport object
				const info = await transporter.sendMail(
					{
						from: `"Homey User" <${Homey.env.MAIL_USER}>`, // sender address
						to: Homey.env.MAIL_RECIPIENT, // list of receivers
						subject: `Sofar & Solarman ${body.logType} log (${Homey.manifest.version})`, // Subject line
						text: logData, // plain text body
					},
				);

				this.updateLog(`Message sent: ${info.messageId}`);
				// Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>

				// Preview only available when sending through an Ethereal account
				this.log('Preview URL: ', nodemailer.getTestMessageUrl(info));
				return this.homey.__('settings.logSent');
			}
			catch (err)
			{
				this.updateLog(`Send log error: ${err.message}`, 0);
			}
		}

		return (this.homey.__('settings.logSendFailed'));
	}

	async Delay(period)
	{
		await new Promise((resolve) => this.homey.setTimeout(resolve, period));
	}

	async getSolarDevices()
	{
		// find Solar devices
		const solarDevices = [];
		const drivers = this.homey.drivers.getDrivers();
		Object.keys(drivers).forEach((driver) =>
		{
			const devices = this.homey.drivers.getDriver(driver).getDevices();
			const numDevices = devices.length;
			for (let i = 0; i < numDevices; i++)
			{
				const device = devices[i];
				// Check if the device is a solar device
				if (device.getData().type === 'panel')
				{
					solarDevices.push(device);
				}
			}
		});
		return solarDevices;
	}

	async getBatteryDevices()
	{
		// find Battery devices
		const batteryDevices = [];
		const drivers = this.homey.drivers.getDrivers();
		Object.keys(drivers).forEach((driver) =>
		{
			const devices = this.homey.drivers.getDriver(driver).getDevices();
			const numDevices = devices.length;
			for (let i = 0; i < numDevices; i++)
			{
				const device = devices[i];
				// Check if the device is a battery device
				if (device.getData().type === 'battery')
				{
					batteryDevices.push(device);
				}
			}
		});
		return batteryDevices;
	}

	async getGridDevices()
	{
		// find Grid devices
		const gridDevices = [];
		const drivers = this.homey.drivers.getDrivers();
		Object.keys(drivers).forEach((driver) =>
		{
			const devices = this.homey.drivers.getDriver(driver).getDevices();
			const numDevices = devices.length;
			for (let i = 0; i < numDevices; i++)
			{
				const device = devices[i];
				// Check if the device is a grid device
				if (device.getData().type === 'grid')
				{
					gridDevices.push(device);
				}
			}
		});
		return gridDevices;
	}

	async getHomeDevices()
	{
		// find Home devices
		const homeDevices = [];
		const drivers = this.homey.drivers.getDrivers();
		Object.keys(drivers).forEach((driver) =>
		{
			const devices = this.homey.drivers.getDriver(driver).getDevices();
			const numDevices = devices.length;
			for (let i = 0; i < numDevices; i++)
			{
				const device = devices[i];
				// Check if the device is a home device
				if (device.getData().type === 'inverter')
				{
					homeDevices.push(device);
				}
			}
		});
		return homeDevices;
	}

	getDeviceById(driver, deviceId)
	{
		return this.homey.drivers.getDriver(driver).getDevices().find((device) => device.__id === deviceId);
	}

	getWidgetEnergyValues(solarDeviceId, batteryDeviceId, gridDeviceId, homeDeviceId)
	{
		const solarDevice = solarDeviceId ? this.getDeviceById('solar_panel', solarDeviceId) : null;
		const batteryDevice = batteryDeviceId ? this.getDeviceById('battery', batteryDeviceId) : null;
		const gridDevice = gridDeviceId ? this.getDeviceById('grid', gridDeviceId) : null;
		const homeDevice = homeDeviceId ? this.getDeviceById('summary', homeDeviceId) : null;

		const retRetval = {};
		if (solarDevice)
		{
			retRetval.solar = {};
			retRetval.solar.power = solarDevice.getCapabilityValue('measure_power');
			retRetval.solar.export = solarDevice.getCapabilityValue('meter_power.today');
		}

		if (batteryDevice)
		{
			retRetval.battery = {};
			retRetval.battery.power = batteryDevice.getCapabilityValue('measure_power');
			retRetval.battery.import = batteryDevice.getCapabilityValue('meter_power.charge_today');
			retRetval.battery.export = batteryDevice.getCapabilityValue('meter_power.discharge_today');
			retRetval.battery.level = batteryDevice.getCapabilityValue('measure_battery');
		}

		if (gridDevice)
		{
			retRetval.grid = {};
			retRetval.grid.power = gridDevice.getCapabilityValue('measure_power');
			retRetval.grid.import = gridDevice.getCapabilityValue('meter_power.today_import');
			retRetval.grid.export = gridDevice.getCapabilityValue('meter_power.today_export');
		}

		if (homeDevice)
		{
			retRetval.home = {};
			retRetval.home.power = homeDevice.getCapabilityValue('measure_power.consumption');
			retRetval.home.import = homeDevice.getCapabilityValue('meter_power.today_consumption');
		}

		return retRetval;
	}

}

module.exports = MyApp;
