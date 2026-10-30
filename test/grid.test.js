'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const manifest = require('../drivers/grid/driver.compose.json');

class Device
{

	constructor()
	{
		this.capabilities = [...manifest.capabilities];
		this.settings = { cost_units: '$', standard: 0.35, export: 0, dual_rate: false };
		this.options = {};
		this.errors = [];
		this.homey = { app: { startLocalFetch: async () => {} } };
	}

	async onInit()
	{
		this.initialized = true;
	}

	log() {}

	error(message)
	{
		this.errors.push(message);
	}

	getCapabilities()
	{
		return [...this.capabilities];
	}

	hasCapability(capability)
	{
		return this.capabilities.includes(capability);
	}

	async addCapability(capability)
	{
		this.capabilities.push(capability);
	}

	async removeCapability(capability)
	{
		this.capabilities = this.capabilities.filter((id) => id !== capability);
	}

	getCapabilityOptions(capability)
	{
		throw new Error(`Invalid Capability: ${capability}`);
	}

	async setCapabilityOptions(capability, options)
	{
		assert.ok(this.hasCapability(capability));
		this.options[capability] = JSON.parse(JSON.stringify(options));
	}

	getSetting(key)
	{
		return this.settings[key];
	}

	getStoreValue()
	{
		return 0;
	}

}

function loadDevice(relativePath, dependencies)
{
	const filename = path.resolve(__dirname, relativePath);
	const module = { exports: {} };
	vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
		module,
		require(name)
		{
			assert.ok(Object.prototype.hasOwnProperty.call(dependencies, name));
			return dependencies[name];
		},
	}, { filename });
	return module.exports;
}

const LanDevice = loadDevice('../drivers/lan_device.js', { homey: { Device } });
const GridDevice = loadDevice('../drivers/grid/device.js', { '../lan_device': LanDevice });

async function changeSettings(device, changes)
{
	const newSettings = { ...device.settings, ...changes };
	await device.onSettings({
		oldSettings: device.settings,
		newSettings,
		changedKeys: Object.keys(changes),
	});
	device.settings = newSettings;
}

test('changing currency updates all existing cost capabilities without reading their options', async () =>
{
	const device = new GridDevice();
	await changeSettings(device, { cost_units: '$' });
	for (const capability of manifest.capabilities.filter((id) => id.startsWith('meter_cost.')))
	{
		assert.deepStrictEqual(device.options[capability], { units: { en: '$' } });
	}
	assert.strictEqual(device.hasCapability('meter_cost.today_export'), true);
	assert.strictEqual(device.hasCapability('meter_cost.today_total'), true);
	assert.deepStrictEqual(device.errors, []);
});

test('currency changes skip absent cost capabilities', async () =>
{
	const device = new GridDevice();
	device.capabilities = ['measure_power', 'meter_cost.today_import'];
	await changeSettings(device, { cost_units: 'EUR' });
	assert.deepStrictEqual(device.options, {
		'meter_cost.today_import': { units: { en: 'EUR' } },
	});
});

test('currency update failures reject the settings change instead of being swallowed', async () =>
{
	const device = new GridDevice();
	device.setCapabilityOptions = async () =>
	{
		throw new Error('Homey rejected the options');
	};
	await assert.rejects(changeSettings(device, { cost_units: '$' }), /Homey rejected the options/);
});

test('initialization reapplies the saved currency after a restart', async () =>
{
	const device = new GridDevice();
	await device.onInit();
	assert.deepStrictEqual(device.options['meter_cost.today_import'], { units: { en: '$' } });
	assert.strictEqual(device.hasCapability('meter_cost.today_export'), false);
	assert.deepStrictEqual(device.errors, []);
});

test('new tariff cost capabilities use the saved currency without changing Currency Unit', async () =>
{
	const device = new GridDevice();
	device.capabilities = ['meter_power.today_import', 'meter_cost.today_import'];
	await changeSettings(device, { dual_rate: true, export: 0.1 });
	for (const capability of ['meter_cost.hi_rate_import', 'meter_cost.low_rate_import', 'meter_cost.today_export', 'meter_cost.today_total'])
	{
		assert.deepStrictEqual(device.options[capability], { units: { en: '$' } });
	}
	await changeSettings(device, { export: 0 });
	assert.strictEqual(device.hasCapability('meter_cost.today_export'), false);
	assert.strictEqual(device.hasCapability('meter_cost.today_total'), false);
});

test('cost capabilities added during inverter discovery use the saved currency', async () =>
{
	const device = new GridDevice();
	device.capabilities = ['measure_power'];
	device.homey.app.getInverter = () => ({
		inverter: {
			parameter_definition: {
				parameters: [{ group: 'grid', items: [{ name: 'Import_Today' }, { name: 'Export_Today' }] }],
			},
		},
	});
	await device.checkCapabilities('inverter');
	assert.deepStrictEqual(device.options['meter_cost.today_import'], { units: { en: '$' } });
	assert.deepStrictEqual(device.options['meter_cost.today_export'], { units: { en: '$' } });
	assert.deepStrictEqual(device.errors, []);
});
