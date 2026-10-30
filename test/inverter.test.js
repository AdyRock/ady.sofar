'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

const Inverter = require('../lib/inverter');
const sofarLsw3 = require('../lib/sofar_lsw3.json');
const sofarG3hyd = require('../lib/sofar_g3hyd.json');

// Serial number taken from the hardcoded retryRequest sample packet
const SAMPLE_SERIAL = 0x8A2D7865;

function makeInverter(overrides = {})
{
	const {
		serial = SAMPLE_SERIAL,
		host = '127.0.0.1',
		port = 8899,
		slaveId = 1,
		lookupFile = 'sofar_lsw3',
		protocol = 'solarman',
		options = { requestDelayMs: 0 },
	} = overrides;
	return new Inverter(serial, host, port, slaveId, lookupFile, protocol, options);
}

// Builds a valid MODBUS RTU response payload [slave, fc, byteCount, data..., crcLo, crcHi]
function buildModbusRtuResponse(inverter, registerValues, mb_fc = 3, slaveId = 1)
{
	const data = [];
	for (const value of registerValues)
	{
		data.push((value >> 8) & 0xFF, value & 0xFF);
	}
	const frame = [slaveId, mb_fc, data.length].concat(data);
	const crc = inverter.getModbusChksum(frame);
	return frame.concat([crc & 0xFF, (crc >> 8) & 0xFF]);
}

describe('MODBUS RTU checksum', () =>
{
	test('matches the CRC embedded in the known-good retryRequest packet', () =>
	{
		const inverter = makeInverter();
		// Business field of retryRequest: slave 1, fc 3, start 512, length 1 with CRC 0xB285 on the wire as [0x85, 0xB2]
		assert.strictEqual(inverter.getModbusChksum([1, 3, 2, 0, 0, 1]), 0xB285);
	});

	test('returns the initial value for empty input', () =>
	{
		const inverter = makeInverter();
		assert.strictEqual(inverter.getModbusChksum([]), 0xFFFF);
	});

	test('round-trips through validateMODBUSData', () =>
	{
		const inverter = makeInverter();
		const response = Buffer.from(buildModbusRtuResponse(inverter, [0x1388, 0x0001]));
		assert.strictEqual(inverter.validateMODBUSData(response, 3), 4);
	});
});

describe('intToArray', () =>
{
	test('encodes big endian with padding', () =>
	{
		const inverter = makeInverter();
		assert.deepStrictEqual(inverter.intToArray(0x1234, 4, false), [0x12, 0x34]);
		assert.deepStrictEqual(inverter.intToArray(5, 4, false), [0x00, 0x05]);
	});

	test('encodes little endian', () =>
	{
		const inverter = makeInverter();
		assert.deepStrictEqual(inverter.intToArray(0x1234, 4, true), [0x34, 0x12]);
	});
});

describe('Solarman V5 request framing', () =>
{
	test('regression: generate_request reproduces the known-good retryRequest packet', () =>
	{
		const inverter = makeInverter();
		const request = inverter.generate_request(512, 1, 3);
		assert.deepStrictEqual(request, Array.from(inverter.retryRequest));
	});

	test('regression: the serial number is always encoded as 4 bytes', () =>
	{
		// Loggers with small serial numbers used to produce short, malformed headers
		const small = makeInverter({ serial: 1 });
		assert.deepStrictEqual(small.get_serial_hex(), [1, 0, 0, 0]);
		assert.strictEqual(small.generate_request(512, 1, 3).length, 36);

		const large = makeInverter();
		assert.deepStrictEqual(large.get_serial_hex(), [0x65, 0x78, 0x2D, 0x8A]);
		assert.strictEqual(large.generate_request(512, 1, 3).length, 36);
	});

	test('generated packets pass validate_checksum', () =>
	{
		const inverter = makeInverter();
		const request = Buffer.from(inverter.generate_request(0, 40, 3));
		assert.strictEqual(inverter.validate_checksum(request), true);
	});

	test('validate_checksum rejects a tampered packet', () =>
	{
		const inverter = makeInverter();
		const request = Buffer.from(inverter.generate_request(0, 40, 3));
		request[10] ^= 0xFF;
		assert.strictEqual(inverter.validate_checksum(request), false);
	});

	test('validate_checksum accepts the hardcoded retryRequest', () =>
	{
		const inverter = makeInverter();
		assert.strictEqual(inverter.validate_checksum(Buffer.from(inverter.retryRequest)), true);
	});
});

describe('MODBUS TCP request framing', () =>
{
	test('builds a valid MBAP header and PDU', () =>
	{
		const inverter = makeInverter({ protocol: 'modbus_tcp', port: 502 });
		const request = inverter.generate_modbus_tcp_request(512, 1, 3);
		assert.deepStrictEqual(request, [
			0x00, 0x01, // transaction ID
			0x00, 0x00, // protocol ID
			0x00, 0x06, // length (unit ID + PDU)
			0x01, // unit ID
			0x03, // function code
			0x02, 0x00, // start register 512
			0x00, 0x01, // quantity 1
		]);
	});

	test('increments and wraps the transaction ID', () =>
	{
		const inverter = makeInverter({ protocol: 'modbus_tcp', port: 502 });
		inverter.generate_modbus_tcp_request(0, 1, 3);
		const second = inverter.generate_modbus_tcp_request(0, 1, 3);
		assert.deepStrictEqual(second.slice(0, 2), [0x00, 0x02]);

		inverter._transactionId = 0xFFFF;
		const wrapped = inverter.generate_modbus_tcp_request(0, 1, 3);
		assert.deepStrictEqual(wrapped.slice(0, 2), [0x00, 0x00]);
	});

	test('encodes the configured slave ID as the unit ID', () =>
	{
		const inverter = makeInverter({ protocol: 'modbus_tcp', port: 502, slaveId: 17 });
		const request = inverter.generate_modbus_tcp_request(0, 1, 3);
		assert.strictEqual(request[6], 17);
	});
});

describe('MODBUS TCP response handling', () =>
{
	function buildTcpResponse({ transactionId = 1, protocolId = 0, unitId = 1, fc = 3, registerValues = [] })
	{
		const data = [];
		for (const value of registerValues)
		{
			data.push((value >> 8) & 0xFF, value & 0xFF);
		}
		const pdu = [fc, data.length].concat(data);
		const packet = Buffer.alloc(7 + pdu.length);
		packet.writeUInt16BE(transactionId, 0);
		packet.writeUInt16BE(protocolId, 2);
		packet.writeUInt16BE(1 + pdu.length, 4);
		packet[6] = unitId;
		Buffer.from(pdu).copy(packet, 7);
		return packet;
	}

	test('hasCompleteModbusTcpPacket detects complete and partial packets', () =>
	{
		const inverter = makeInverter({ protocol: 'modbus_tcp' });
		const packet = buildTcpResponse({ registerValues: [0x1388] });
		assert.strictEqual(inverter.hasCompleteModbusTcpPacket(packet), true);
		assert.strictEqual(inverter.hasCompleteModbusTcpPacket(packet.subarray(0, 6)), false);
		assert.strictEqual(inverter.hasCompleteModbusTcpPacket(packet.subarray(0, packet.length - 1)), false);
	});

	test('extracts the register bytes from a valid response', () =>
	{
		const inverter = makeInverter({ protocol: 'modbus_tcp' });
		const packet = buildTcpResponse({ registerValues: [0x1388, 0x0064] });
		const result = inverter.processModbusTcpPacket(packet, 3);
		assert.strictEqual(result.readUInt16BE(0), 0x1388);
		assert.strictEqual(result.readUInt16BE(2), 0x0064);
	});

	test('returns an empty buffer for an empty response', () =>
	{
		const inverter = makeInverter({ protocol: 'modbus_tcp' });
		const result = inverter.processModbusTcpPacket(Buffer.alloc(0), 3);
		assert.strictEqual(result.length, 0);
	});

	test('throws on an incomplete header', () =>
	{
		const inverter = makeInverter({ protocol: 'modbus_tcp' });
		assert.throws(() => inverter.processModbusTcpPacket(Buffer.from([0, 1, 0]), 3), /Incomplete MODBUS TCP header/);
	});

	test('throws on an invalid protocol ID', () =>
	{
		const inverter = makeInverter({ protocol: 'modbus_tcp' });
		const packet = buildTcpResponse({ protocolId: 7, registerValues: [1] });
		assert.throws(() => inverter.processModbusTcpPacket(packet, 3), /Invalid MODBUS TCP protocol ID/);
	});

	test('throws on a MODBUS exception response', () =>
	{
		const inverter = makeInverter({ protocol: 'modbus_tcp' });
		const packet = Buffer.from([0, 1, 0, 0, 0, 3, 1, 0x83, 0x02]);
		assert.throws(() => inverter.processModbusTcpPacket(packet, 3), /exception/);
	});

	test('throws on an unexpected function code', () =>
	{
		const inverter = makeInverter({ protocol: 'modbus_tcp' });
		const packet = buildTcpResponse({ fc: 4, registerValues: [1] });
		assert.throws(() => inverter.processModbusTcpPacket(packet, 3), /expected function code 3/);
	});

	test('throws when the data is shorter than the byte count', () =>
	{
		const inverter = makeInverter({ protocol: 'modbus_tcp' });
		const packet = Buffer.from([0, 1, 0, 0, 0, 4, 1, 3, 4, 0x13]);
		assert.throws(() => inverter.processModbusTcpPacket(packet, 3), /Incomplete MODBUS TCP data/);
	});
});

describe('validateMODBUSData', () =>
{
	test('returns 0 when more data is needed', () =>
	{
		const inverter = makeInverter();
		assert.strictEqual(inverter.validateMODBUSData(Buffer.from([1, 3]), 3), 0);
		const response = Buffer.from(buildModbusRtuResponse(inverter, [1, 2, 3]));
		assert.strictEqual(inverter.validateMODBUSData(response.subarray(0, response.length - 3), 3), 0);
	});

	test('returns -1 for a corrupted packet', () =>
	{
		const inverter = makeInverter();
		const response = Buffer.from(buildModbusRtuResponse(inverter, [1, 2]));
		response[4] ^= 0xFF; // corrupt a data byte so the CRC no longer matches
		assert.strictEqual(inverter.validateMODBUSData(response, 3), -1);
	});

	test('returns -1 for the wrong function code', () =>
	{
		const inverter = makeInverter();
		const response = Buffer.from(buildModbusRtuResponse(inverter, [1, 2]));
		assert.strictEqual(inverter.validateMODBUSData(response, 4), -1);
	});
});

describe('isLikelyAsciiPayload', () =>
{
	test('accepts printable text with whitespace', () =>
	{
		const inverter = makeInverter();
		assert.strictEqual(inverter.isLikelyAsciiPayload(Buffer.from('HTTP/1.1 200 OK\r\n')), true);
	});

	test('rejects binary data and short payloads', () =>
	{
		const inverter = makeInverter();
		assert.strictEqual(inverter.isLikelyAsciiPayload(Buffer.from([0xA5, 0x17, 0x00, 0x10, 0x45, 0x00, 0x00, 0x65])), false);
		assert.strictEqual(inverter.isLikelyAsciiPayload(Buffer.from('short')), false);
		assert.strictEqual(inverter.isLikelyAsciiPayload(null), false);
	});
});

describe('Inverter configuration', () =>
{
	test('setLookupFile falls back to sofar_lsw3 for unknown register maps', () =>
	{
		const inverter = makeInverter();
		inverter.setLookupFile('does_not_exist');
		assert.strictEqual(inverter.parameter_definition, sofarLsw3);
		inverter.setLookupFile('sofar_g3hyd');
		assert.strictEqual(inverter.parameter_definition, sofarG3hyd);
	});

	test('setProtocol and getProtocol round-trip', () =>
	{
		const inverter = makeInverter();
		assert.strictEqual(inverter.getProtocol(), 'solarman');
		inverter.setProtocol('modbus_tcp');
		assert.strictEqual(inverter.getProtocol(), 'modbus_tcp');
		inverter.setProtocol('solarman');
		assert.strictEqual(inverter.getProtocol(), 'solarman');
	});

	test('setConnectionOptions applies valid values and ignores invalid ones', () =>
	{
		const inverter = makeInverter();
		inverter.setConnectionOptions({ timeoutMs: 1234, retryCount: 5, requestDelayMs: 50, reuseConnection: true });
		assert.strictEqual(inverter._timeoutMs, 1234);
		assert.strictEqual(inverter._retryCount, 5);
		assert.strictEqual(inverter._requestDelayMs, 50);
		assert.strictEqual(inverter._reuseConnection, true);

		inverter.setConnectionOptions({ timeoutMs: 'nope', retryCount: NaN });
		assert.strictEqual(inverter._timeoutMs, 1234);
		assert.strictEqual(inverter._retryCount, 5);
	});

	test('get_sensors exposes the register map items', () =>
	{
		const inverter = makeInverter();
		const sensors = inverter.get_sensors();
		const expected = sofarLsw3.parameters.reduce((count, group) => count + group.items.length, 0);
		assert.strictEqual(sensors.length, expected);
	});
});
