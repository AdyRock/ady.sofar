'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const device = { ip: '192.168.1.20', serial: 1234567890, registerMap: 'sofar_ktlx_g' };

function makeApp(settings)
{
	const filename = path.resolve(__dirname, '../app.js');
	const module = { exports: {} };
	vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
		module,
		process: { env: {} },
		require(name)
		{
			if (name === 'homey') return { App: function App() {} };
			return {};
		},
	}, { filename });
	const App = module.exports;
	const app = new App();
	app.homey = { settings: {
		get: (key) => settings[key],
		set: (key, value) => { settings[key] = value; },
	} };
	app.lanSensors = [];
	app.updateLog = () => {};
	return app;
}

function makeSettings(settings, delayedKey)
{
	const elements = new Map();
	function element(id)
	{
		if (!elements.has(id))
		{
			const listeners = {};
			elements.set(id, {
				value: '',
style: {},
selectedIndex: -1,
checked: false,
disabled: false,
				addEventListener: (event, listener) => { listeners[event] = listener; },
				fire: (event) => listeners[event]({ preventDefault() {} }),
				add() {},
				click() {},
			});
		}
		return elements.get(id);
	}
	const radios = [element('connectionModeAuto'), element('connectionModeManual')];
	radios[0].value = 'auto';
	radios[1].value = 'manual';
	const alerts = [];
	const writes = [];
	let failKey;
	let delayedRead;
	const homey = {
		__: (key) => key,
		get(key, callback)
		{
			if (key === delayedKey) delayedRead = () => callback(null, settings[key]);
			else callback(null, settings[key]);
		},
		set(key, value, callback)
		{
			writes.push(key);
			if (key === failKey) return callback(new Error(`Cannot save ${key}`));
			settings[key] = value;
			return callback(null);
		},
		alert: (message) => alerts.push(message),
		api() {},
		on() {},
		ready() {},
	};
	const document = {
		getElementById: element,
		getElementsByName: () => radios,
		querySelector: () => ({}),
		createElement: () => ({}),
	};
	const filename = path.resolve(__dirname, '../settings/index.html');
	const html = fs.readFileSync(filename, 'utf8');
	const script = /<script type="text\/javascript">([\s\S]*?)<\/script>/.exec(html)[1];
	const context = vm.createContext({
		document,
		busy_indicator: class {

 show() {} hide() {}

},
	});
	vm.runInContext(script, context, { filename });
	context.onHomeyReady(homey);
	return {
		element,
radios,
alerts,
writes,
html,
		finishRead: () => delayedRead(),
		fail: (key) => { failKey = key; },
	};
}

test('backend uses Automatic unless Manual has a usable device', () =>
{
	for (const manualSensors of [undefined, [], [null, {}, { ip: '   ' }, { ip: 123 }]])
	{
		assert.equal(makeApp({ connectionMode: 'manual', manualSensors }).getConnectionMode(), 'auto');
	}
	assert.equal(makeApp({ connectionMode: 'manual', manualSensors: [device] }).getConnectionMode(), 'manual');
	assert.equal(makeApp({ connectionMode: 'auto', manualSensors: [device] }).getConnectionMode(), 'auto');
});

test('connection setup persists Automatic for an empty Manual list and starts discovery', async () =>
{
	const settings = { connectionMode: 'manual', manualSensors: [] };
	const app = makeApp(settings);
	let scanned = false;
	app.startScanner = async () => { scanned = true; };
	app.setupManualDevices = async () => assert.fail('Empty manual list must not suppress discovery');
	await app.setupConnections();
	assert.equal(settings.connectionMode, 'auto');
	assert.equal(scanned, true);
});

test('connection setup registers manual devices before starting discovery', async () =>
{
	const app = makeApp({ connectionMode: 'manual', manualSensors: [device] });
	const calls = [];
	app.setupManualDevices = async () => calls.push('manual');
	app.startScanner = async () => calls.push('scanner');
	await app.setupConnections();
	assert.deepEqual(calls, ['manual', 'scanner']);
});

test('mode control is on Manual Devices and empty lists disable Manual regardless of read order', () =>
{
	for (const delayedKey of ['connectionMode', 'manualSensors'])
	{
		const ui = makeSettings({ connectionMode: 'manual', manualSensors: [] }, delayedKey);
		ui.finishRead();
		assert.equal(ui.radios[0].checked, true);
		assert.equal(ui.radios[1].disabled, true);
		assert.equal(ui.element('connectionModeStatus').textContent, 'settings.connectionModeEmpty');
		assert.ok(ui.html.indexOf('id="devices"') < ui.html.indexOf('id="connectionModeAuto"'));
		assert.ok(ui.html.indexOf('id="connectionModeAuto"') < ui.html.indexOf('id="manualDevices"'));
	}
});

test('saved manual devices remain selected regardless of settings read order', () =>
{
	for (const delayedKey of ['connectionMode', 'manualSensors'])
	{
		const ui = makeSettings({ connectionMode: 'manual', manualSensors: [device] }, delayedKey);
		ui.finishRead();
		assert.equal(ui.radios[1].checked, true);
		assert.equal(ui.radios[1].disabled, false);
	}
});

test('invalid stored devices do not enable Manual in the settings page', () =>
{
	const ui = makeSettings({ connectionMode: 'manual', manualSensors: [null, {}, { ip: '   ' }, { ip: 123 }] });
	assert.equal(ui.radios[0].checked, true);
	assert.equal(ui.radios[1].disabled, true);
});

test('adding and editing devices selects Manual automatically', () =>
{
	for (const editing of [false, true])
	{
		const settings = { connectionMode: 'auto', manualSensors: editing ? [device] : [] };
		const ui = makeSettings(settings);
		if (editing)
		{
			ui.element('manualDevices').selectedIndex = 0;
			ui.element('editDevice').fire('click');
		}
		else ui.element('addDevice').fire('click');
		ui.element('dialogIp').value = device.ip;
		ui.element('dialogSerial').value = String(device.serial);
		ui.element('dialogProtocol').value = 'solarman';
		ui.element('dialogRegisterMap').value = device.registerMap;
		ui.element('dialogSave').fire('click');
		assert.equal(settings.connectionMode, 'manual');
		assert.equal(settings.manualSensors.length, 1);
		assert.equal(settings.manualSensors[0].registerMap, 'sofar_ktlx_g');
		assert.equal(ui.radios[1].checked, true);
		assert.equal(ui.element('connectionModeStatus').textContent, 'settings.connectionModeActive');
		assert.deepEqual(ui.writes, ['manualSensors', 'connectionMode']);
	}
});

test('deleting devices preserves the current mode until the last device is removed', () =>
{
	for (const connectionMode of ['auto', 'manual'])
	{
		const settings = { connectionMode, manualSensors: [device, { ...device, ip: '192.168.1.21' }] };
		const ui = makeSettings(settings);
		ui.element('manualDevices').selectedIndex = 0;
		ui.element('removeDevice').fire('click');
		assert.equal(settings.connectionMode, connectionMode);
		ui.element('manualDevices').selectedIndex = 0;
		ui.element('removeDevice').fire('click');
		assert.equal(settings.connectionMode, 'auto');
		assert.equal(ui.radios[0].checked, true);
		assert.equal(ui.radios[1].disabled, true);
	}
});

test('mode changes save immediately and polling Save does not overwrite the mode', () =>
{
	const settings = { connectionMode: 'manual', manualSensors: [device] };
	const ui = makeSettings(settings);
	ui.radios[0].checked = true;
	ui.radios[1].checked = false;
	ui.radios[0].fire('change');
	assert.equal(settings.connectionMode, 'auto');
	assert.equal(settings.manualSensors.length, 1);
	assert.equal(ui.element('connectionModeStatus').textContent, 'settings.connectionModeInactive');
	ui.element('pollingIntervalSeconds').value = '30';
	ui.element('saveSettings').fire('click');
	assert.equal(settings.pollingIntervalSeconds, 30);
	assert.deepEqual(ui.writes, ['connectionMode', 'pollingIntervalSeconds']);
});

test('failed mode changes restore the saved selection and report the error', () =>
{
	const settings = { connectionMode: 'auto', manualSensors: [device] };
	const ui = makeSettings(settings);
	ui.fail('connectionMode');
	ui.radios[0].checked = false;
	ui.radios[1].checked = true;
	ui.radios[1].fire('change');
	assert.equal(settings.connectionMode, 'auto');
	assert.equal(ui.radios[0].checked, true);
	assert.match(ui.alerts[0].message, /Cannot save connectionMode/);
});

test('failed device saves do not change mode or close the edit dialog', () =>
{
	const settings = { connectionMode: 'auto', manualSensors: [device] };
	const ui = makeSettings(settings);
	ui.element('manualDevices').selectedIndex = 0;
	ui.element('editDevice').fire('click');
	ui.fail('manualSensors');
	ui.element('dialogSave').fire('click');
	assert.equal(settings.connectionMode, 'auto');
	assert.equal(ui.element('addDeviceDialog').className, 'dialog_div show');
	assert.deepEqual(ui.writes, ['manualSensors']);
	assert.match(ui.alerts[0].message, /Cannot save manualSensors/);
});

test('failed automatic activation leaves the saved device visible and reports the failure', () =>
{
	const settings = { connectionMode: 'auto', manualSensors: [device] };
	const ui = makeSettings(settings);
	ui.element('manualDevices').selectedIndex = 0;
	ui.element('editDevice').fire('click');
	ui.element('dialogRegisterMap').value = 'sofar_hy_es';
	ui.fail('connectionMode');
	ui.element('dialogSave').fire('click');
	assert.equal(settings.connectionMode, 'auto');
	assert.equal(settings.manualSensors[0].registerMap, 'sofar_hy_es');
	assert.equal(ui.element('connectionModeStatus').textContent, 'settings.connectionModeInactive');
	assert.equal(ui.element('addDeviceDialog').className, 'dialog_div show');
	assert.match(ui.alerts[0].message, /Cannot save connectionMode/);
});
