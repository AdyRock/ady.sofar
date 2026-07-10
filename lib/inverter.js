/* eslint-disable camelcase */
/* eslint-disable no-console */
/* jslint node: true */

'use strict';

// Code based on https://github.com/StephanJoubert/home_assistant_solarman
// From solarman.py

const net = require('node:net');
const ParameterParser = require('./parse');

const sofar_lsw3 = require('./sofar_lsw3.json');
const sofar_g3hyd = require('./sofar_g3hyd.json');
const solis_hybrid = require('./solis_hybrid.json');
const deye_hybrid = require('./deye_hybrid.json');
const sofar_hy_es = require('./sofar_hy_es.json');
const sun3p = require('./sun3p.json');
const sofar_ktlx_g = require('./sofar_ktlx_g.json');

const START_OF_MESSAGE = 0xA5;
const END_OF_MESSAGE = 0x15;
const CONTROL_CODE = [0x10, 0x45];
const SERIAL_NO = [0x00, 0x00];
const SEND_DATA_FIELD = [0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
const BIG = false;
const LITTLE = true;

class Inverter
{

	constructor(serial, host, port, mb_slaveid, lookup_file)
	{
		this.busy = false;
		this._serial = serial;
		this._host = host;
		this._port = port;
		this._mb_slaveid = mb_slaveid;
		this._current_val = null;
		this.status_connection = 'Disconnected';
		this.status_lastUpdate = 'N/A';

		if (lookup_file === 'sofar_g3hyd')
		{
			this.parameter_definition = sofar_g3hyd;
		}
		else if (lookup_file === 'solis_hybrid')
		{
			this.parameter_definition = solis_hybrid;
		}
		else if (lookup_file === 'deye_hybrid')
		{
			this.parameter_definition = deye_hybrid;
		}
		else if (lookup_file === 'sofar_hy_es')
		{
			this.parameter_definition = sofar_hy_es;
		}
		else if (lookup_file === 'sun3p')
		{
			this.parameter_definition = sun3p;
		}
		else if (lookup_file === 'sofar_ktlx_g')
		{
			this.parameter_definition = sofar_ktlx_g;
		}
		else
		{
			this.parameter_definition = sofar_lsw3;
		}

		this.retryRequest = new Uint8Array([165, 23, 0, 16, 69, 0, 0, 101, 120, 45, 138, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 2, 0, 0, 1, 133, 178, 64, 21]);
	}

	setHost(host)
	{
		this._host = host;
	}

	setSlaveId(slaveId)
	{
		this._mb_slaveid = slaveId;
	}

	getModbusChksum(data)
	{
		let crc = 0xFFFF;

		for (const byte of data)
		{
			crc ^= byte;

			for (let shift = 1; shift <= 8; shift++)
			{
				const lastbit = crc & 1;
				crc = (crc >> 1) & 0x7FFF;

				if (lastbit === 1)
				{
					crc ^= 0xA001;
				}
			}
		}
		return crc;
	}

	intToArray(value, size, littleEndian)
	{
		const serial_hex = value.toString(16).padStart(size, 0);
		const serial_bytes = [];
		for (let c = 0; c < serial_hex.length; c += 2)
		{
			serial_bytes.push(parseInt(serial_hex.substr(c, 2), 16));
		}

		if (littleEndian)
		{
			serial_bytes.reverse();
		}

		return serial_bytes;
	}

	get_serial_hex()
	{
		return this.intToArray(this._serial, 4, LITTLE);
	}

	get_read_business_field(start, length, mb_fc)
	{
		let request_data = [];
		request_data = request_data.concat(this.intToArray(this._mb_slaveid, 2, BIG));
		request_data = request_data.concat(this.intToArray(mb_fc, 2, BIG));
		request_data = request_data.concat(this.intToArray(start, 4, BIG));
		request_data = request_data.concat(this.intToArray(length, 4, BIG));
		const crc = this.getModbusChksum(request_data);
		request_data = request_data.concat(this.intToArray(crc, 4, LITTLE));

		// request_data = bytearray([this._mb_slaveid, mb_fc]); // Function Code
		// request_data.extend(start.to_bytes(2, 'big'));
		// request_data.extend(length.to_bytes(2, 'big'));
		// crc = this.modbus(request_data);
		// request_data.extend(crc.to_bytes(2, 'little'));
		return request_data;
	}

	generate_request(start, length, mb_fc)
	{
		let packet_data = [];
		packet_data = packet_data.concat(SEND_DATA_FIELD);

		const business_field = this.get_read_business_field(start, length, mb_fc);
		packet_data = packet_data.concat(business_field);

		// Header
		let packet = [];
		packet = packet.concat(this.intToArray(packet_data.length, 4, LITTLE));
		packet = packet.concat(CONTROL_CODE);
		packet = packet.concat(SERIAL_NO);
		packet = packet.concat(this.get_serial_hex());
		packet = packet.concat(packet_data);

		// Checksum
		let checksum = 0;
		for (const c of packet)
		{
			checksum += c;
		}

		checksum &= 0xFF;
		packet = packet.concat(this.intToArray(checksum, 2, LITTLE));
		packet = packet.concat(END_OF_MESSAGE);

		return [START_OF_MESSAGE].concat(packet);
	}

	validate_checksum(packet)
	{
		let checksum = 0;
		const { length } = packet;
		// Don't include the checksum and END OF MESSAGE (-2)
		for (let i = 1; i < length - 2; i++)
		{
			checksum += packet[i];
		}
		checksum &= 0xFF;
		if (checksum === packet[length - 2])
		{
			return true;
		}

		return false;
	}

	// Returns -1 if the data is corrupted, 0 if the data is incomplete or the number of bytes to be processed
	validateMODBUSData(MODBUSPacket, mb_functioncode)
	{
		if (MODBUSPacket.length < 3)
		{
			// Not enough data so try to collect some more
			return 0;
		}

		// Now validate the MODBUS data
		if ((MODBUSPacket[0] === 1) && (MODBUSPacket[1] === mb_functioncode))
		{
			// Found a valid MODBUS start so extract the transmitted number of MODBUS data bytes
			const byteCountRequired = MODBUSPacket[2];
			const byteCountReceived = MODBUSPacket.length - 5;
			if (byteCountRequired > byteCountReceived)
			{
				// Not enough data so try to collect some more
				return 0;
			}

			const modbusData = MODBUSPacket.subarray(0, 3 + byteCountRequired); // Get the MODBUSS packet (without the checksum)
			const chkSumCalc = this.getModbusChksum(modbusData); // Calculate the checksum
			const chkSumRx = MODBUSPacket.readUInt16LE(3 + byteCountRequired); // Extract the packet checksum
			if (chkSumCalc === chkSumRx)
			{
				// Valid checksum so return the number of bytes to process
				return byteCountRequired;
			}
		}

		// Bad data
		return -1;
	}

	isLikelyAsciiPayload(packet)
	{
		if (!packet || packet.length < 8)
		{
			return false;
		}

		for (const byte of packet)
		{
			const isPrintable = (byte >= 0x20) && (byte <= 0x7E);
			const isWhitespace = (byte === 0x09) || (byte === 0x0A) || (byte === 0x0D);
			if (!isPrintable && !isWhitespace)
			{
				return false;
			}
		}

		return true;
	}

	async send_request(start, end, mb_fc)
	{
		console.log(`send_request: slave = ${this._mb_slaveid}, start = ${start}, end = ${end}, fc = ${mb_fc}`);

		const length = end - start + 1;
		const requestData = this.generate_request(start, length, mb_fc);

		if (this.busy)
		{
			console.log('Inverter is busy, waiting...');
			while (this.busy)
			{
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		}

		this.busy = true;

		try
		{
			return await new Promise((resolve, reject) =>
			{
				const returnData = [];
				let rawData = Buffer.alloc(0);
				let requestFinished = false;
				const writeBuffer = Buffer.from(requestData);

				const finish = (handler) =>
				{
					if (requestFinished)
					{
						return;
					}
					requestFinished = true;
					handler();
				};

				const processPacket = () =>
				{
					if (rawData.length === 0)
					{
						resolve(Buffer.concat(returnData));
						return;
					}

					const startIndex = rawData.indexOf(START_OF_MESSAGE);
					if (startIndex < 0)
					{
						if (this.isLikelyAsciiPayload(rawData))
						{
							console.log('Ignoring non-MODBUS ASCII payload', rawData);
							resolve(Buffer.concat(returnData));
							return;
						}

						reject(new Error('Invalid V5 packet start'));
						return;
					}

					const endIndex = rawData.lastIndexOf(END_OF_MESSAGE);
					if (endIndex <= startIndex)
					{
						reject(new Error('Incomplete V5 packet'));
						return;
					}

					const packet = rawData.subarray(startIndex, endIndex + 1);
					if (!this.validate_checksum(packet))
					{
						console.log('Invalid V5 checksum');
						reject(new Error('Invalid V5 checksum'));
						return;
					}

					const modbusSection = packet.subarray(25, packet.length - 2);
						if (modbusSection.length === 0)
						{
							reject(new Error('Empty MODBUS packet'));
							return;
						}
					if ((returnData.length === 0) && (modbusSection[0] !== 1))
					{
						console.log('Invalid data', modbusSection);
						reject(new Error('Invalid MODBUS packet'));
						return;
					}

					returnData.push(modbusSection);
					const modbusPacket = Buffer.concat(returnData);
					const bytesToProcess = this.validateMODBUSData(modbusPacket, mb_fc);
					if (bytesToProcess < 0)
					{
						console.log('No MODBUS data to process data');
						reject(new Error('Invalid MODBUS packet'));
						return;
					}

					if (bytesToProcess > 0)
					{
						const modbusData = modbusPacket.subarray(3, 3 + bytesToProcess);
						console.log('Data received: ', modbusData);
						resolve(modbusData);
						return;
					}

					reject(new Error('Incomplete MODBUS packet'));
				};

				const hasCompleteV5Packet = () =>
				{
					if (rawData.length < 5)
					{
						return false;
					}

					const startIndex = rawData.indexOf(START_OF_MESSAGE);
					if (startIndex < 0)
					{
						return false;
					}

					const endIndex = rawData.lastIndexOf(END_OF_MESSAGE);
					return endIndex > startIndex;
				};

				const conn = new net.Socket();
				conn.setTimeout(5000);
				conn.connect(this._port, this._host, () =>
				{
					// console.log('Connection writting: ', writeBuffer);
					conn.write(writeBuffer);
				});

				conn.on('data', (data) =>
				{
					rawData = Buffer.concat([rawData, data]);

					if (!requestFinished && hasCompleteV5Packet())
					{
						finish(processPacket);
						conn.destroy();
					}
				});
				conn.on('end', () =>
				{
					console.log('Connection ended');
				});
				conn.on('close', () =>
				{
					console.log('Connection closed');
					finish(processPacket);
				});
				conn.on('error', (err) =>
				{
					console.log(`Connection error: ${err}`);
					finish(() => reject(new Error(`Send Error: ${err}`)));
				});
				conn.on('timeout', () =>
				{
					console.log('Connection timeout');
					conn.destroy();
					finish(processPacket);
				});
			});
		}
		finally
		{
			this.busy = false;
		}
	}

	update()
	{
		this.get_statistics();
	}

	async get_statistics()
	{
		let result = false;
		let error = false;
		const previousStats = (this._current_val && (typeof this._current_val === 'object') && !Buffer.isBuffer(this._current_val)) ? this._current_val : null;
		const params = new ParameterParser(this.parameter_definition);
		for (const request of this.parameter_definition.requests)
		{
			try
			{
				this._current_val = await this.send_request(request.start, request.end, request.mb_functioncode);
				if (!this._current_val || (this._current_val.length === 0))
				{
					error = true;
					continue;
				}
				params.parse(this._current_val, request.start, (request.end - request.start + 1));
				result = true;
			}
			catch (err)
			{
				console.log('send_request error', err.message);
				error = true;
			}
		}
		if (result)
		{
			const parsedStats = params.get_result();
			const mergedStats = previousStats ? { ...previousStats, ...parsedStats } : parsedStats;
			this.status_lastUpdate = new Date(Date.now()).toLocaleString();
			this.status_connection = error ? 'Connected (partial)' : 'Connected';
			this._current_val = mergedStats;
			return this._current_val;
		}

		if (!result)
		{
			this.status_connection = 'Disconnected';
		}
		return null;
	}

	get_current_val()
	{
		return this._current_val;
	}

	get_sensors()
	{
		const params = new ParameterParser(this.parameter_definition);
		return params.get_sensors();
	}

}

module.exports = Inverter;
