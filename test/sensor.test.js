'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

const Sensor = require('../lib/sensor');
const sofarLsw3 = require('../lib/sofar_lsw3.json');
const deyeHybrid = require('../lib/deye_hybrid.json');

function makeSensor(lookupFile = 'sofar_lsw3', protocol = 'solarman')
{
	return new Sensor(1234567890, '127.0.0.1', 8899, 1, lookupFile, protocol, { requestDelayMs: 0 });
}

function countItems(definition)
{
	return definition.parameters.reduce((count, group) => count + group.items.length, 0);
}

describe('Sensor', () =>
{
	test('getSensors returns one entity per register map item plus two status entities', async () =>
	{
		const sensor = makeSensor();
		const sensors = await sensor.getSensors();
		assert.strictEqual(sensors.length, countItems(sofarLsw3) + 2);
	});

	test('getSerial returns the configured serial number', () =>
	{
		const sensor = makeSensor();
		assert.strictEqual(sensor.getSerial(), 1234567890);
	});

	test('setRegisterMap switches the register definitions', async () =>
	{
		const sensor = makeSensor();
		sensor.setRegisterMap('deye_hybrid');
		assert.strictEqual(sensor.inverter.parameter_definition, deyeHybrid);

		const sensors = await sensor.getSensors();
		assert.strictEqual(sensors.length, countItems(deyeHybrid) + 2);
	});

	test('protocol setter and getter delegate to the inverter', () =>
	{
		const sensor = makeSensor();
		assert.strictEqual(sensor.getProtocol(), 'solarman');
		sensor.setProtocol('modbus_tcp');
		assert.strictEqual(sensor.getProtocol(), 'modbus_tcp');
	});

	test('host, port and slave setters delegate to the inverter', () =>
	{
		const sensor = makeSensor();
		sensor.setHost('192.168.1.50');
		sensor.setPort(502);
		sensor.setSlaveId(3);
		assert.strictEqual(sensor.inverter._host, '192.168.1.50');
		assert.strictEqual(sensor.inverter._port, 502);
		assert.strictEqual(sensor.inverter._mb_slaveid, 3);
	});

	test('regression: entity name and unique_id getters do not throw', async () =>
	{
		// These used to call the non-existent Python-style ''.format()
		const sensor = makeSensor();
		const sensors = await sensor.getSensors();
		for (const entity of sensors)
		{
			assert.strictEqual(typeof entity.name, 'string');
			assert.ok(entity.name.startsWith('Homey '));
			assert.strictEqual(typeof entity.unique_id, 'string');
			assert.ok(entity.unique_id.includes('1234567890'));
		}
	});

	test('a text sensor update reads the parsed value from the inverter', async () =>
	{
		const sensor = makeSensor();
		const sensors = await sensor.getSensors();
		const entity = sensors[0];

		// Stub the inverter so update() does not hit the network
		entity.inverter = {
			update: () => {},
			get_current_val: () => ({ [entity._field_name]: 42 }),
		};

		entity.update();
		assert.strictEqual(entity.state, 42);
	});

	test('a text sensor update leaves the state unchanged when no data is available', async () =>
	{
		const sensor = makeSensor();
		const sensors = await sensor.getSensors();
		const entity = sensors[0];

		entity.inverter = {
			update: () => {},
			get_current_val: () => null,
		};

		entity.update();
		assert.strictEqual(entity.state, null);
	});
});
