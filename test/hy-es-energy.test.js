'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ParameterParser = require('../lib/parse');
const definition = require('../lib/sofar_hy_es.json');
const appManifest = require('../app.json');
const generationTime = require('../.homeycompose/capabilities/measure_generation_time.json');

function parseRegisters(start, values)
{
	const buffer = Buffer.alloc(values.length * 2);
	values.forEach((value, index) => buffer.writeUInt16BE(value & 0xFFFF, index * 2));
	const parser = new ParameterParser(definition);
	parser.parse(buffer, start, values.length);
	return parser.get_result();
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

class Device
{

	constructor()
	{
		this.values = {};
		this.events = [];
		this.energy = null;
		this.energyChanges = 0;
		this.capabilities = [];
		this.homey = {
			api: { realtime: (name, event) => this.events.push({ name, ...event }) },
			app: {
				async startLocalFetch()
				{
					this.fetchStarted = true;
				},
				getInverter()
				{
					return null;
				},
				updateLog(message)
				{
					assert.fail(message);
				},
			},
		};
	}

	getData()
	{
		return { id: 'hy-es' };
	}

	hasCapability(capability)
	{
		return this.capabilities.includes(capability);
	}

	async addCapability(capability)
	{
		this.capabilities.push(capability);
	}

	getEnergy()
	{
		return this.energy;
	}

	async setEnergy(energy)
	{
		this.energyChanges++;
		this.energy = energy;
	}

	setAvailable()
	{
		this.available = true;
	}

	async setCapabilityValue(capability, value)
	{
		this.values[capability] = value;
	}

}

const LanDevice = loadDevice('../drivers/lan_device.js', { homey: { Device } });
const BatteryDevice = loadDevice('../drivers/battery/device.js', { '../lan_device': LanDevice });
const GridDevice = loadDevice('../drivers/grid/device.js', { '../lan_device': LanDevice });
const SolarPanelDevice = loadDevice('../drivers/solar_panel/device.js', { '../lan_device': LanDevice });
const SummaryDevice = loadDevice('../drivers/summary/device.js', { '../lan_device': LanDevice });

test('HY-ES discharge is negative and charging is positive for Homey Energy and the widget', async () =>
{
	for (const [register, expected] of [[-81, -810], [81, 810], [0, 0]])
	{
		const data = parseRegisters(525, [register]);
		assert.strictEqual(data.Battery_Power, expected);
		const device = new BatteryDevice();
		await device.updateLanDeviceValues('hy-es', data);
		assert.strictEqual(device.values.measure_power, expected);
		assert.strictEqual(device.events[0].value, expected);
	}
});

test('grid and battery devices migrate manifest energy settings without replacing overrides', async () =>
{
	const gridEnergy = appManifest.drivers.find((driver) => driver.id === 'grid').energy;
	const batteryEnergy = appManifest.drivers.find((driver) => driver.id === 'battery').energy;

	for (const [DeviceClass, energy] of [[GridDevice, gridEnergy], [BatteryDevice, batteryEnergy]])
	{
		const device = new DeviceClass();
		device.driver = { manifest: { energy } };
		await device.migrateEnergyConfiguration();
		assert.deepStrictEqual(device.energy, energy);
		assert.strictEqual(device.energyChanges, 1);
		await device.migrateEnergyConfiguration();
		assert.strictEqual(device.energyChanges, 1);
	}

	const device = new GridDevice();
	device.driver = { manifest: { energy: gridEnergy } };
	device.energy = { custom: true };
	await device.migrateEnergyConfiguration();
	assert.deepStrictEqual(device.energy, { custom: true });
	assert.strictEqual(device.energyChanges, 0);
});

test('summary exposes standard cumulative house consumption to Homey Energy', async () =>
{
	const inverter = { inverter: { parameter_definition: definition } };
	const device = new SummaryDevice();
	device.homey.app.getInverter = () => inverter;
	device.CapabilitiesChecked = false;

	await device.checkCapabilities('hy-es');
	assert.strictEqual(appManifest.drivers.find((driver) => driver.id === 'summary').class, 'sensor');
	assert.ok(device.capabilities.includes('measure_power'));
	assert.ok(device.capabilities.includes('meter_power'));
	assert.strictEqual(device.energy.cumulative, true);
	assert.strictEqual(device.energy.cumulativeImportedCapability, undefined);

	const data = parseRegisters(531, [74]);
	data.Total_Consumption = 1234.56;
	await device.updateLanDeviceValues('hy-es', data);
	assert.strictEqual(device.values.measure_power, data.Consumption);
	assert.strictEqual(device.values.meter_power, 1234.56);
	assert.strictEqual(device.values['measure_power.consumption'], data.Consumption);
});

test('summary migration removes the experimental imported-meter mapping', async () =>
{
	// A device configured by the experimental test build loses the imported capability mapping
	const device = new SummaryDevice();
	device.capabilities = ['meter_power'];
	device.energy = { cumulative: true, cumulativeImportedCapability: 'meter_power' };
	await device.migrateHouseEnergyConfiguration();
	assert.strictEqual(device.energy.cumulative, true);
	assert.strictEqual(device.energy.cumulativeImportedCapability, undefined);
	assert.strictEqual(device.energyChanges, 1);

	// Running the migration again leaves the configuration untouched
	await device.migrateHouseEnergyConfiguration();
	assert.strictEqual(device.energyChanges, 1);

	// A device without the experimental mapping is left untouched
	const bareDevice = new SummaryDevice();
	bareDevice.energy = { cumulative: true };
	await bareDevice.migrateHouseEnergyConfiguration();
	assert.strictEqual(bareDevice.energyChanges, 0);
});

test('reported nighttime balance treats battery discharge as energy supplied to the home', () =>
{
	const data = parseRegisters(525, [-81]);
	const solarPower = 0;
	const gridImport = 70;
	assert.strictEqual(solarPower + gridImport - data.Battery_Power, 880);
});

test('nighttime PV string register values are ignored when total PV power is zero', async () =>
{
	const device = new SolarPanelDevice();
	device.CapabilitiesChecked = true;
	device.sumPV1_PV2 = false;
	await device.updateLanDeviceValues('hy-es', {
		PV_Power: 0,
		PV1_Power: 19720,
		PV1_Voltage: 874.5,
		PV1_Current: 22.1,
		PV2_Power: 19800,
		PV2_Voltage: 879.2,
		PV2_Current: 22.3,
	});

	assert.deepStrictEqual(device.values, { measure_power: 0 });
});

test('daytime PV string register values are cleared when inconsistent with total PV power', async () =>
{
	const device = new SolarPanelDevice();
	device.CapabilitiesChecked = true;
	device.sumPV1_PV2 = false;
	device.capabilities = ['measure_power.pv1', 'measure_voltage.pv1', 'measure_current.pv1'];
	device.values['measure_voltage.pv1'] = 504.7;

	// Values reported by a ZCS HYD 3000-ES: strings read zero power while the total PV power is 290 W
	await device.updateLanDeviceValues('hy-es', {
		PV_Power: 290,
		PV1_Power: 0,
		PV1_Voltage: 504.7,
		PV1_Current: 0,
	});

	assert.strictEqual(device.values.measure_power, 290);
	assert.strictEqual(device.values['measure_power.pv1'], null);
	assert.strictEqual(device.values['measure_voltage.pv1'], null);
	assert.strictEqual(device.values['measure_current.pv1'], null);
});

test('PV string register values are published when consistent with total PV power', async () =>
{
	const device = new SolarPanelDevice();
	device.CapabilitiesChecked = true;
	device.sumPV1_PV2 = false;

	await device.updateLanDeviceValues('hy-es', {
		PV_Power: 1500,
		PV1_Power: 760,
		PV1_Voltage: 420.5,
		PV1_Current: 1.81,
		PV2_Power: 750,
		PV2_Voltage: 418.2,
		PV2_Current: 1.79,
	});

	assert.strictEqual(device.values.measure_power, 1500);
	assert.strictEqual(device.values['measure_power.pv1'], 760);
	assert.strictEqual(device.values['measure_current.pv1'], 1.81);
	assert.strictEqual(device.values['measure_power.pv2'], 750);
	assert.strictEqual(device.values['measure_voltage.pv2'], 418.2);
});

test('HY-ES battery voltage retains the confirmed hundredth-volt scale', () =>
{
	assert.ok(Math.abs(parseRegisters(526, [5260]).Battery_Voltage - 52.6) < 0.000001);
});

test('HY-ES lifetime energy totals remain separate from daily energy counters', () =>
{
	const data = parseRegisters(536, [913, 16, 372, 1000, 0, 9000, 0, 100, 0, 3000]);
	assert.strictEqual(data.Daily_Production, 9.13);
	assert.strictEqual(data.Import_Today, 3.72);
	assert.strictEqual(data.Export_Today, 0.16);
	assert.strictEqual(data.Total_Generation, 9000);
	assert.strictEqual(data.Total_Export, 100);
	assert.strictEqual(data.Total_Import, 3000);
	const grid = appManifest.drivers.find((driver) => driver.id === 'grid');
	assert.strictEqual(grid.energy.cumulativeImportedCapability, 'meter_power.total_import');
	assert.strictEqual(grid.energy.cumulativeExportedCapability, 'meter_power.total_export');
});

test('generation time displays minutes in both the source and generated manifest', () =>
{
	assert.strictEqual(generationTime.units.en, 'min');
	assert.strictEqual(appManifest.capabilities.measure_generation_time.units.en, 'min');
	assert.strictEqual(parseRegisters(579, [426]).Generation_Time_Today, 426);
});
