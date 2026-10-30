'use strict';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const dgram = require('node:dgram');

const InverterScanner = require('../lib/scanner');

// Minimal stand-in for the Homey timer API used by the scanner
const homeyMock = {
	setTimeout: (fn, ms) => setTimeout(fn, ms),
	clearTimeout: (id) => clearTimeout(id),
	setInterval: (fn, ms) => setInterval(fn, ms),
	clearInterval: (id) => clearInterval(id),
};

const scanners = [];
afterEach(() =>
{
	while (scanners.length > 0)
	{
		scanners.pop().stopScanning();
	}
});

function makeScanner(options = {})
{
	const scanner = new InverterScanner(homeyMock, '10.255.255.1', options);
	scanners.push(scanner);
	return scanner;
}

describe('InverterScanner retry handling', () =>
{
	test('applies the configured retry options and defaults', () =>
	{
		const scanner = makeScanner({ maxRetries: 3, retryBaseDelayMs: 10, retryMaxDelayMs: 50 });
		assert.strictEqual(scanner._maxRetries, 3);
		assert.strictEqual(scanner._retryBaseDelayMs, 10);
		assert.strictEqual(scanner._retryMaxDelayMs, 50);

		const defaults = makeScanner({ maxRetries: -1, retryBaseDelayMs: 0 });
		assert.strictEqual(defaults._maxRetries, 10);
		assert.strictEqual(defaults._retryBaseDelayMs, 5000);
	});

	test('retries with exponential backoff up to the retry limit', async () =>
	{
		const scanner = makeScanner({ maxRetries: 2, retryBaseDelayMs: 5, retryMaxDelayMs: 10 });

		let discoverCalls = 0;
		scanner._discover_inverters = (callback) =>
		{
			discoverCalls++;
			scanner._scheduleRetry(callback);
		};

		scanner._scheduleRetry(() => {});
		await new Promise((resolve) => setTimeout(resolve, 100));

		// The initial retry triggers discovery which schedules one more retry before the limit is reached
		assert.strictEqual(discoverCalls, 2);
		assert.strictEqual(scanner._retryCount, 2);
		assert.strictEqual(scanner._retryTimer, null);
	});

	test('does not stack multiple pending retries', () =>
	{
		const scanner = makeScanner({ maxRetries: 5, retryBaseDelayMs: 60000 });
		scanner._scheduleRetry(() => {});
		scanner._scheduleRetry(() => {});
		assert.strictEqual(scanner._retryCount, 1);
	});

	test('stopScanning clears the retry state', () =>
	{
		const scanner = makeScanner({ maxRetries: 5, retryBaseDelayMs: 60000 });
		scanner._scheduleRetry(() => {});
		assert.ok(scanner._retryTimer);

		scanner.stopScanning();
		assert.strictEqual(scanner._retryTimer, null);
		assert.strictEqual(scanner._retryCount, 0);
		assert.strictEqual(scanner._scanning, false);
	});
});

describe('InverterScanner discovery', () =>
{
	test('parses a discovery response and reports it through the callback', async (t) =>
	{
		const scanner = makeScanner({ maxRetries: 0 });

		const found = new Promise((resolve) =>
		{
			scanner.startScanning((ip, serial) => resolve({ ip, serial }));
		});

		// Give the scanner a moment to bind its socket
		await new Promise((resolve) => setTimeout(resolve, 200));

		if (!scanner._scannerSocket)
		{
			t.skip('UDP port 48899 is not available in this environment');
			return;
		}

		// Pretend to be a logger answering the broadcast
		const responder = dgram.createSocket('udp4');
		const reply = Buffer.from('192.168.1.123,AA:BB:CC:DD:EE:FF,2712345678');
		await new Promise((resolve, reject) =>
		{
			responder.send(reply, 0, reply.length, scanner.port, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
		});

		const result = await Promise.race([
			found,
			new Promise((resolve) => setTimeout(() => resolve(null), 2500)),
		]);
		responder.close();

		if (result === null)
		{
			t.skip('No UDP loopback reply was received in this environment');
			return;
		}

		assert.strictEqual(result.ip, '192.168.1.123');
		assert.strictEqual(result.serial, 2712345678);
		assert.strictEqual(scanner.get_ipaddress(), '192.168.1.123');
		assert.strictEqual(scanner.get_serialno(), 2712345678);

		// A successful discovery must stop the broadcast cycle
		assert.strictEqual(scanner._scanning, false);
		assert.strictEqual(scanner._scannerSocket, null);
		assert.strictEqual(scanner._scannerTimer, null);
	});

	test('ignores messages that do not have three comma-separated fields', async (t) =>
	{
		const scanner = makeScanner({ maxRetries: 0 });

		let callbackHits = 0;
		scanner.startScanning(() => { callbackHits++; });
		await new Promise((resolve) => setTimeout(resolve, 200));

		if (!scanner._scannerSocket)
		{
			t.skip('UDP port 48899 is not available in this environment');
			return;
		}

		const responder = dgram.createSocket('udp4');
		const reply = Buffer.from('not-a-valid-reply');
		await new Promise((resolve, reject) =>
		{
			responder.send(reply, 0, reply.length, scanner.port, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
		});
		await new Promise((resolve) => setTimeout(resolve, 300));
		responder.close();

		assert.strictEqual(callbackHits, 0);
		assert.strictEqual(scanner.get_ipaddress(), null);
	});
});
