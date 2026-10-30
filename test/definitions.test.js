'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

const REGISTER_MAPS = {
	sofar_lsw3: require('../lib/sofar_lsw3.json'),
	sofar_g3hyd: require('../lib/sofar_g3hyd.json'),
	sofar_ktlx_g: require('../lib/sofar_ktlx_g.json'),
	sofar_hy_es: require('../lib/sofar_hy_es.json'),
	solis_hybrid: require('../lib/solis_hybrid.json'),
	sun3p: require('../lib/sun3p.json'),
	deye_hybrid: require('../lib/deye_hybrid.json'),
	deye_sg04lp3: require('../lib/deye_sg04lp3.json'),
};

const VALID_RULES = [1, 2, 3, 4, 5, 6];

// Registers that are knowingly defined without a matching polling request
const KNOWN_UNPOLLED_FIELDS = {
	sofar_g3hyd: ['Alert', 'Fault_1', 'Fault_2', 'Fault_3', 'Fault_4', 'Fault_5', 'Fault_6', 'Fault_7', 'Fault_8', 'Fault_9', 'Fault_10', 'Fault_11', 'Fault_12'],
};

describe('register map definitions', () =>
{
	for (const [mapName, definition] of Object.entries(REGISTER_MAPS))
	{
		describe(mapName, () =>
		{
			test('has a valid requests list', () =>
			{
				assert.ok(Array.isArray(definition.requests), 'requests must be an array');
				assert.ok(definition.requests.length > 0, 'requests must not be empty');
				for (const request of definition.requests)
				{
					assert.strictEqual(typeof request.start, 'number', `request start must be a number: ${JSON.stringify(request)}`);
					assert.strictEqual(typeof request.end, 'number', `request end must be a number: ${JSON.stringify(request)}`);
					assert.ok(request.end >= request.start, `request range must not be inverted: ${JSON.stringify(request)}`);
					assert.strictEqual(typeof request.mb_functioncode, 'number', `request function code must be a number: ${JSON.stringify(request)}`);
				}
			});

			test('every item has a name, a valid rule and registers', () =>
			{
				assert.ok(Array.isArray(definition.parameters), 'parameters must be an array');
				const seenNames = new Set();
				for (const group of definition.parameters)
				{
					assert.ok(Array.isArray(group.items), `group ${group.group} must have items`);
					for (const item of group.items)
					{
						assert.strictEqual(typeof item.name, 'string', `item name must be a string: ${JSON.stringify(item)}`);
						assert.ok(item.name.length > 0, 'item name must not be empty');
						assert.ok(VALID_RULES.includes(item.rule), `item ${item.name} has unsupported rule ${item.rule}`);
						assert.ok(Array.isArray(item.registers) && (item.registers.length > 0), `item ${item.name} must declare registers`);
						for (const register of item.registers)
						{
							assert.ok(Number.isInteger(register) && (register >= 0) && (register <= 0xFFFF), `item ${item.name} has invalid register ${register}`);
						}

						assert.ok(!seenNames.has(item.name), `duplicate item name ${item.name}`);
						seenNames.add(item.name);
					}
				}
			});

			test('numeric items declare a scale or a lookup table', () =>
			{
				for (const group of definition.parameters)
				{
					for (const item of group.items)
					{
						if ([1, 2, 3, 4].includes(item.rule))
						{
							const hasScale = typeof item.scale === 'number';
							const hasLookup = Array.isArray(item.lookup) && (item.lookup.length > 0);
							assert.ok(hasScale || hasLookup, `item ${item.name} would parse to NaN without a scale or lookup`);
						}
					}
				}
			});

			test('lookup tables are well formed', () =>
			{
				for (const group of definition.parameters)
				{
					for (const item of group.items)
					{
						if (item.lookup)
						{
							for (const option of item.lookup)
							{
								assert.strictEqual(typeof option.key, 'number', `item ${item.name} lookup key must be a number`);
								assert.ok(option.value !== undefined, `item ${item.name} lookup value must be defined`);
							}
						}
					}
				}
			});

			test('every register is covered by a polling request', () =>
			{
				const allowList = KNOWN_UNPOLLED_FIELDS[mapName] || [];
				for (const group of definition.parameters)
				{
					for (const item of group.items)
					{
						if (allowList.includes(item.name))
						{
							continue;
						}

						for (const register of item.registers)
						{
							const covered = definition.requests.some((request) => (register >= request.start) && (register <= request.end));
							assert.ok(covered, `item ${item.name} register ${register} is never polled by any request`);
						}
					}
				}
			});

			test('numeric multi-register items use at most two registers', () =>
			{
				// The parser combines words 16 bits at a time; above 2 registers precision and semantics are untested
				for (const group of definition.parameters)
				{
					for (const item of group.items)
					{
						if ([1, 2, 3, 4].includes(item.rule))
						{
							assert.ok(item.registers.length <= 2, `item ${item.name} uses ${item.registers.length} registers with numeric rule ${item.rule}`);
						}
					}
				}
			});
		});
	}
});
