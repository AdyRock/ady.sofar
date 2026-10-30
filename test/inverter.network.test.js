'use strict';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const net = require('node:net');

const Inverter = require('../lib/inverter');

const SAMPLE_SERIAL = 0x8A2D7865;
const TEST_TIMEOUT_MS = 2000;

const cleanups = [];
afterEach(async () =>
{
	while (cleanups.length > 0)
	{
		await cleanups.pop()();
	}
});

// Starts a TCP server that calls connectionHandler for every connection, and returns its port
async function startServer(connectionHandler)
{
	const sockets = new Set();
	const server = net.createServer((socket) =>
	{
		sockets.add(socket);
		socket.on('close', () => sockets.delete(socket));
		connectionHandler(socket);
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	cleanups.push(() => new Promise((resolve) =>
	{
		// Destroy any connections that are still open, otherwise close() never completes
		for (const socket of sockets)
		{
			socket.destroy();
		}
		server.close(resolve);
	}));
	return server.address().port;
}

function makeInverter(port, protocol, options = {})
{
	const inverter = new Inverter(SAMPLE_SERIAL, '127.0.0.1', port, 1, 'sofar_lsw3', protocol, {
		timeoutMs: TEST_TIMEOUT_MS,
		retryCount: 0,
		requestDelayMs: 0,
		...options,
	});
	cleanups.push(() => inverter.closeModbusTcpSocket());
	return inverter;
}

function crc16(data)
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

// Builds a MODBUS TCP response for the given register values
function buildTcpResponse(transactionId, registerValues, fc = 3)
{
	const data = [];
	for (const value of registerValues)
	{
		data.push((value >> 8) & 0xFF, value & 0xFF);
	}
	const pdu = [fc, data.length].concat(data);
	const packet = Buffer.alloc(7 + pdu.length);
	packet.writeUInt16BE(transactionId, 0);
	packet.writeUInt16BE(0, 2);
	packet.writeUInt16BE(1 + pdu.length, 4);
	packet[6] = 1;
	Buffer.from(pdu).copy(packet, 7);
	return packet;
}

// Builds a Solarman V5 response frame wrapping a MODBUS RTU response
function buildV5Response(registerValues, { fc = 3, corruptChecksum = false } = {})
{
	const data = [];
	for (const value of registerValues)
	{
		data.push((value >> 8) & 0xFF, value & 0xFF);
	}
	const rtuFrame = [1, fc, data.length].concat(data);
	const crc = crc16(rtuFrame);
	const modbusSection = rtuFrame.concat([crc & 0xFF, (crc >> 8) & 0xFF]);

	// The client extracts the MODBUS section from offset 25, so pad the header to 25 bytes total
	const header = [0xA5].concat(new Array(24).fill(0));
	const body = header.concat(modbusSection);

	let checksum = 0;
	for (let i = 1; i < body.length; i++)
	{
		checksum += body[i];
	}
	checksum &= 0xFF;
	if (corruptChecksum)
	{
		checksum ^= 0xFF;
	}

	return Buffer.from(body.concat([checksum, 0x15]));
}

// Reads the requested register count from a MODBUS TCP request
function parseTcpRequest(data)
{
	return {
		transactionId: data.readUInt16BE(0),
		start: data.readUInt16BE(8),
		quantity: data.readUInt16BE(10),
	};
}

describe('MODBUS TCP end to end', () =>
{
	test('send_request returns the register data from a mock inverter', async () =>
	{
		const port = await startServer((socket) =>
		{
			socket.on('data', (data) =>
			{
				const { transactionId, quantity } = parseTcpRequest(data);
				const values = Array.from({ length: quantity }, (unused, index) => 5000 + index);
				socket.write(buildTcpResponse(transactionId, values));
			});
		});

		const inverter = makeInverter(port, 'modbus_tcp');
		const result = await inverter.send_request(0, 1, 3);
		assert.strictEqual(result.length, 4);
		assert.strictEqual(result.readUInt16BE(0), 5000);
		assert.strictEqual(result.readUInt16BE(2), 5001);
	});

	test('send_request handles a response split across multiple TCP segments', async () =>
	{
		const port = await startServer((socket) =>
		{
			socket.on('data', (data) =>
			{
				const { transactionId, quantity } = parseTcpRequest(data);
				const values = Array.from({ length: quantity }, () => 1234);
				const response = buildTcpResponse(transactionId, values);
				socket.write(response.subarray(0, 5));
				setTimeout(() => socket.write(response.subarray(5)), 20);
			});
		});

		const inverter = makeInverter(port, 'modbus_tcp');
		const result = await inverter.send_request(0, 2, 3);
		assert.strictEqual(result.length, 6);
		assert.strictEqual(result.readUInt16BE(4), 1234);
	});

	test('send_request rejects on a MODBUS exception response', async () =>
	{
		const port = await startServer((socket) =>
		{
			socket.on('data', (data) =>
			{
				const { transactionId } = parseTcpRequest(data);
				const packet = Buffer.from([0, 0, 0, 0, 0, 3, 1, 0x83, 0x02]);
				packet.writeUInt16BE(transactionId, 0);
				socket.write(packet);
			});
		});

		const inverter = makeInverter(port, 'modbus_tcp');
		await assert.rejects(inverter.send_request(0, 0, 3), /exception/);
	});

	test('send_request rejects with a timeout when the inverter never responds', async () =>
	{
		const port = await startServer(() => {});

		const inverter = makeInverter(port, 'modbus_tcp', { timeoutMs: 1000 });
		await assert.rejects(inverter.send_request(0, 0, 3), /Connection timeout/);
	});

	test('send_request rejects when the connection is refused', async () =>
	{
		// Grab a free port and close the server again so nothing is listening
		const server = net.createServer();
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const { port } = server.address();
		await new Promise((resolve) => server.close(resolve));

		const inverter = makeInverter(port, 'modbus_tcp');
		await assert.rejects(inverter.send_request(0, 0, 3), /Connection error/);
	});

	test('send_request retries after a failed attempt', async () =>
	{
		let connections = 0;
		const port = await startServer((socket) =>
		{
			connections++;
			if (connections === 1)
			{
				// Fail the first attempt by closing the connection without a response
				socket.destroy();
				return;
			}

			socket.on('data', (data) =>
			{
				const { transactionId } = parseTcpRequest(data);
				socket.write(buildTcpResponse(transactionId, [4321]));
			});
		});

		const inverter = makeInverter(port, 'modbus_tcp', { retryCount: 1 });
		const result = await inverter.send_request(0, 0, 3);
		assert.strictEqual(result.readUInt16BE(0), 4321);
		assert.strictEqual(connections, 2);
	});

	test('reuseConnection keeps a single socket across requests', async () =>
	{
		let connections = 0;
		const port = await startServer((socket) =>
		{
			connections++;
			socket.on('data', (data) =>
			{
				const { transactionId } = parseTcpRequest(data);
				socket.write(buildTcpResponse(transactionId, [1111]));
			});
		});

		const inverter = makeInverter(port, 'modbus_tcp', { reuseConnection: true });
		await inverter.send_request(0, 0, 3);
		await inverter.send_request(0, 0, 3);
		assert.strictEqual(connections, 1);
	});

	test('get_statistics parses register data into named values', async () =>
	{
		const port = await startServer((socket) =>
		{
			socket.on('data', (data) =>
			{
				const { transactionId, quantity } = parseTcpRequest(data);
				// Register 0 = 5001 (frequency raw), register 1 = low word, register 2 = high word
				const values = [5001, 0x0000, 0x8000].slice(0, quantity);
				socket.write(buildTcpResponse(transactionId, values));
			});
		});

		const inverter = makeInverter(port, 'modbus_tcp');
		inverter.parameter_definition = {
			requests: [{ start: 0, end: 2, mb_functioncode: 3 }],
			parameters: [{
				group: 'test',
				items: [
					{ name: 'Grid_Frequency', rule: 1, registers: [0], scale: 0.01 },
					{ name: 'Total_Energy', rule: 3, registers: [1, 2], scale: 1 },
				],
			}],
		};

		const statistics = await inverter.get_statistics();
		assert.ok(statistics);
		assert.strictEqual(statistics.Grid_Frequency, 50.01);
		assert.strictEqual(statistics.Total_Energy, 2147483648);
		assert.strictEqual(inverter.status_connection, 'Connected');
	});

	test('get_statistics returns null and reports Disconnected when every request fails', async () =>
	{
		const port = await startServer((socket) => socket.destroy());

		const inverter = makeInverter(port, 'modbus_tcp');
		inverter.parameter_definition = {
			requests: [{ start: 0, end: 0, mb_functioncode: 3 }],
			parameters: [{ group: 'test', items: [{ name: 'Value', rule: 1, registers: [0], scale: 1 }] }],
		};

		const statistics = await inverter.get_statistics();
		assert.strictEqual(statistics, null);
		assert.strictEqual(inverter.status_connection, 'Disconnected');
	});
});

describe('Solarman V5 end to end', () =>
{
	test('send_request returns the register data from a mock logger', async () =>
	{
		const port = await startServer((socket) =>
		{
			socket.on('data', () =>
			{
				socket.write(buildV5Response([5001, 2300]));
			});
		});

		const inverter = makeInverter(port, 'solarman');
		const result = await inverter.send_request(0, 1, 3);
		assert.strictEqual(result.length, 4);
		assert.strictEqual(result.readUInt16BE(0), 5001);
		assert.strictEqual(result.readUInt16BE(2), 2300);
	});

	test('send_request rejects on an invalid V5 checksum', async () =>
	{
		const port = await startServer((socket) =>
		{
			socket.on('data', () =>
			{
				socket.write(buildV5Response([5001], { corruptChecksum: true }));
			});
		});

		const inverter = makeInverter(port, 'solarman');
		await assert.rejects(inverter.send_request(0, 0, 3), /Invalid V5 checksum/);
	});

	test('send_request rejects when the logger sends garbage', async () =>
	{
		const port = await startServer((socket) =>
		{
			socket.on('data', () =>
			{
				// No V5 start byte and not ASCII either
				socket.write(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x15]));
				socket.end();
			});
		});

		const inverter = makeInverter(port, 'solarman');
		await assert.rejects(inverter.send_request(0, 0, 3), /Invalid V5 packet start/);
	});

	test('send_request resolves with no data for a non-MODBUS ASCII payload', async () =>
	{
		const port = await startServer((socket) =>
		{
			socket.on('data', () =>
			{
				socket.write(Buffer.from('HTTP/1.1 400 Bad Request\r\n\r\n'));
				socket.end();
			});
		});

		const inverter = makeInverter(port, 'solarman');
		const result = await inverter.send_request(0, 0, 3);
		assert.strictEqual(result.length, 0);
	});

	test('get_statistics parses values delivered through the V5 framing', async () =>
	{
		const port = await startServer((socket) =>
		{
			socket.on('data', () =>
			{
				socket.write(buildV5Response([5020, 0xFFF6]));
			});
		});

		const inverter = makeInverter(port, 'solarman');
		inverter.parameter_definition = {
			requests: [{ start: 0, end: 1, mb_functioncode: 3 }],
			parameters: [{
				group: 'test',
				items: [
					{ name: 'Grid_Frequency', rule: 1, registers: [0], scale: 0.01 },
					{ name: 'Battery_Power', rule: 2, registers: [1], scale: 10 },
				],
			}],
		};

		const statistics = await inverter.get_statistics();
		assert.ok(statistics);
		assert.strictEqual(statistics.Grid_Frequency, 50.2);
		assert.strictEqual(statistics.Battery_Power, -100);
	});
});
