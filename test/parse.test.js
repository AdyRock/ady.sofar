'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

const ParameterParser = require('../lib/parse');

// Builds a raw register buffer from an array of 16-bit register values
function regsToBuffer(values)
{
	const buffer = Buffer.alloc(values.length * 2);
	values.forEach((value, index) => buffer.writeUInt16BE(value & 0xFFFF, index * 2));
	return buffer;
}

function makeLookups(items)
{
	return { parameters: [{ group: 'test', items }] };
}

function parseOne(items, registerValues, start = 0)
{
	const parser = new ParameterParser(makeLookups(items));
	parser.parse(regsToBuffer(registerValues), start, registerValues.length);
	return parser.get_result();
}

describe('ParameterParser unsigned values (rules 1 and 3)', () =>
{
	test('parses a single register with scale 1 as an integer', () =>
	{
		const result = parseOne([{ name: 'Value', rule: 1, registers: [0], scale: 1 }], [1234]);
		assert.strictEqual(result.Value, 1234);
	});

	test('applies a fractional scale', () =>
	{
		const result = parseOne([{ name: 'Frequency', rule: 1, registers: [0], scale: 0.01 }], [5001]);
		assert.strictEqual(result.Frequency, 50.01);
	});

	test('applies an offset before the scale', () =>
	{
		const result = parseOne([{ name: 'Value', rule: 1, registers: [0], scale: 1, offset: 40 }], [100]);
		assert.strictEqual(result.Value, 60);
	});

	test('combines two registers little-word-first into a 32-bit value', () =>
	{
		// registers[0] is the low word, registers[1] the high word
		const result = parseOne([{ name: 'Total', rule: 3, registers: [0, 1], scale: 1 }], [0x5678, 0x1234]);
		assert.strictEqual(result.Total, 0x12345678);
	});

	test('regression: a 32-bit unsigned value with the high bit set stays positive', () =>
	{
		// `(word << 16)` wraps to a negative number in JavaScript - this used to produce -2147483648
		const result = parseOne([{ name: 'Total', rule: 3, registers: [0, 1], scale: 1 }], [0x0000, 0x8000]);
		assert.strictEqual(result.Total, 2147483648);
	});

	test('regression: the maximum 32-bit unsigned value parses correctly', () =>
	{
		const result = parseOne([{ name: 'Total', rule: 3, registers: [0, 1], scale: 1 }], [0xFFFF, 0xFFFF]);
		assert.strictEqual(result.Total, 4294967295);
	});

	test('parses registers relative to the request start address', () =>
	{
		const result = parseOne([{ name: 'Value', rule: 1, registers: [1157], scale: 1 }], [10, 20, 30], 1156);
		assert.strictEqual(result.Value, 20);
	});

	test('skips fields whose registers fall outside the parsed window', () =>
	{
		const result = parseOne([{ name: 'Missing', rule: 1, registers: [10], scale: 1 }], [1, 2, 3]);
		assert.strictEqual('Missing' in result, false);
	});

	test('skips fields when only some of the registers are inside the window', () =>
	{
		const result = parseOne([{ name: 'Partial', rule: 3, registers: [2, 3], scale: 1 }], [1, 2, 3]);
		assert.strictEqual('Partial' in result, false);
	});
});

describe('ParameterParser signed values (rules 2 and 4)', () =>
{
	test('parses a positive 16-bit value', () =>
	{
		const result = parseOne([{ name: 'Power', rule: 2, registers: [0], scale: 1 }], [1500]);
		assert.strictEqual(result.Power, 1500);
	});

	test('parses a negative 16-bit value', () =>
	{
		const result = parseOne([{ name: 'Power', rule: 2, registers: [0], scale: 1 }], [0xFFFF]);
		assert.strictEqual(result.Power, -1);
	});

	test('parses the most negative 16-bit value', () =>
	{
		const result = parseOne([{ name: 'Power', rule: 2, registers: [0], scale: 1 }], [0x8000]);
		assert.strictEqual(result.Power, -32768);
	});

	test('applies the scale to a negative value', () =>
	{
		const result = parseOne([{ name: 'Power', rule: 2, registers: [0], scale: 0.1 }], [0xFFF6]);
		assert.strictEqual(result.Power, -1);
	});

	test('parses a positive 32-bit value', () =>
	{
		const result = parseOne([{ name: 'Energy', rule: 4, registers: [0, 1], scale: 1 }], [0xFFFF, 0x7FFF]);
		assert.strictEqual(result.Energy, 2147483647);
	});

	test('parses a negative 32-bit value', () =>
	{
		const result = parseOne([{ name: 'Energy', rule: 4, registers: [0, 1], scale: 1 }], [0xFFFE, 0xFFFF]);
		assert.strictEqual(result.Energy, -2);
	});

	test('parses the most negative 32-bit value', () =>
	{
		const result = parseOne([{ name: 'Energy', rule: 4, registers: [0, 1], scale: 1 }], [0x0000, 0x8000]);
		assert.strictEqual(result.Energy, -2147483648);
	});

	test('applies an offset before the sign conversion', () =>
	{
		const result = parseOne([{ name: 'Value', rule: 2, registers: [0], scale: 1, offset: 1 }], [0]);
		assert.strictEqual(result.Value, -1);
	});
});

describe('ParameterParser lookup values', () =>
{
	test('resolves an exact lookup key', () =>
	{
		const items = [{
			name: 'Status',
			rule: 1,
			registers: [0],
			scale: 1,
			lookup: [{ key: 0, value: 'Standby' }, { key: 2, value: 'Normal' }],
		}];
		assert.strictEqual(parseOne(items, [2]).Status, 'Normal');
		assert.strictEqual(parseOne(items, [0]).Status, 'Standby');
	});

	test('combines masked lookup matches into a list', () =>
	{
		const items = [{
			name: 'Alerts',
			rule: 1,
			registers: [0],
			scale: 1,
			lookup: [
				{ key: 1, mask: 1, value: 'Fault A' },
				{ key: 2, mask: 2, value: 'Fault B' },
				{ key: 4, mask: 4, value: 'Fault C' },
			],
		}];
		assert.strictEqual(parseOne(items, [3]).Alerts, 'Fault A, Fault B');
		assert.strictEqual(parseOne(items, [4]).Alerts, 'Fault C');
	});

	test('returns LOOKUP when no masked option matches', () =>
	{
		const items = [{
			name: 'Alerts',
			rule: 1,
			registers: [0],
			scale: 1,
			lookup: [{ key: 1, mask: 1, value: 'Fault A' }],
		}];
		assert.strictEqual(parseOne(items, [0]).Alerts, 'LOOKUP');
	});
});

describe('ParameterParser ascii values (rule 5)', () =>
{
	test('regression: decodes every register of a multi-register ascii field', () =>
	{
		// toString() takes an end offset, not a length - this used to return only the first two characters
		const items = [{ name: 'Inverter_ID', rule: 5, registers: [0, 1, 2], isstr: true }];
		const parser = new ParameterParser(makeLookups(items));
		parser.parse(Buffer.from('ABCDEF', 'utf8'), 0, 3);
		assert.strictEqual(parser.get_result().Inverter_ID, 'ABCDEF');
	});

	test('decodes a single-register ascii field', () =>
	{
		const items = [{ name: 'Id', rule: 5, registers: [0], isstr: true }];
		const parser = new ParameterParser(makeLookups(items));
		parser.parse(Buffer.from('XY', 'utf8'), 0, 1);
		assert.strictEqual(parser.get_result().Id, 'XY');
	});
});

describe('ParameterParser bit fields (rule 6)', () =>
{
	test('collects the hex representation of each register', () =>
	{
		const items = [{ name: 'Fault_Bits', rule: 6, registers: [0, 1], isstr: true }];
		const result = parseOne(items, [0x1234, 0xABCD]);
		assert.deepStrictEqual(result.Fault_Bits, ['1234', 'abcd']);
	});
});

describe('ParameterParser helpers', () =>
{
	test('get_sensors returns every defined item', () =>
	{
		const lookups = {
			parameters: [
				{ group: 'a', items: [{ name: 'One', rule: 1, registers: [0], scale: 1 }] },
				{ group: 'b', items: [{ name: 'Two', rule: 2, registers: [1], scale: 1 }, { name: 'Three', rule: 5, registers: [2] }] },
			],
		};
		const parser = new ParameterParser(lookups);
		const sensors = parser.get_sensors();
		assert.deepStrictEqual(sensors.map((sensor) => sensor.name), ['One', 'Two', 'Three']);
	});

	test('is_integer_num distinguishes integers from floats', () =>
	{
		const parser = new ParameterParser(makeLookups([]));
		assert.strictEqual(parser.is_integer_num(5), true);
		assert.strictEqual(parser.is_integer_num(-5), true);
		assert.strictEqual(parser.is_integer_num(5.5), false);
		assert.strictEqual(parser.is_integer_num(NaN), false);
	});
});
