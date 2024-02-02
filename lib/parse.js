/* eslint-disable no-console */

// Code based on https://github.com/StephanJoubert/home_assistant_solarman
// parse.py

'use strict';

// The parameters start in the "business field"
// just after the first two bytes.
const OFFSET_PARAMS = 0;

class ParameterParser
{

    constructor(lookups)
    {
        this.result = {};
        this._lookups = lookups;
    }

    parse(rawData, start, length)
    {
        for (const i of this._lookups.parameters)
        {
            for (const j of i.items)
            {
                this.try_parse_field(rawData, j, start, length);
            }
        }
    }

    get_result()
    {
        return this.result;
    }

    try_parse_field(rawData, definition, start, length)
    {
        const { rule } = definition;
        if (rule === 1)
        {
            this.try_parse_unsigned(rawData, definition, start, length);
        }
        else if (rule === 2)
        {
            this.try_parse_signed(rawData, definition, start, length);
        }
        else if (rule === 3)
        {
            this.try_parse_unsigned(rawData, definition, start, length);
        }
        else if (rule === 4)
        {
            this.try_parse_signed(rawData, definition, start, length);
        }
        else if (rule === 5)
        {
            this.try_parse_ascii(rawData, definition, start, length);
        }
        else if (rule === 6)
        {
            this.try_parse_bits(rawData, definition, start, length);
        }
    }

    try_parse_signed(rawData, definition, start, length)
    {
        const title = definition.name;
        const { scale } = definition;
        let value = 0;
        let found = true;
        let shift = 0;
        let maxint = 0;
        for (const r of definition.registers)
        {
            const index = r - start; // get the decimal value of the register'
            if ((index >= 0) && (index < length))
            {
                maxint <<= 16;
                maxint |= 0xFFFF;
                const offset = (index * 2);
                if (offset < rawData.length)
                {
                    const temp = rawData.readInt16BE(offset);
                    value += (temp & 0xFFFF) << shift;
                    shift += 16;
                }
            }
            else
            {
                found = false;
            }
        }
        if (found)
        {
            if (definition.offset)
            {
                value -= definition.offset;
            }
            if (value > maxint / 2)
            {
                value = (value - maxint) * scale;
            }
            else
            {
                value *= scale;
            }
            if (this.is_integer_num(value))
            {
                this.result[title] = parseInt(value, 10);
            }
            else
            {
                this.result[title] = value;
            }
        }
    }

    try_parse_unsigned(rawData, definition, start, length)
    {
        const title = definition.name;
        const { scale } = definition;
        let value = 0;
        let found = true;
        let shift = 0;
        for (const r of definition.registers)
        {
            const index = r - start; // get the decimal value of the register '
            if ((index >= 0) && (index < length))
            {
                const offset = OFFSET_PARAMS + (index * 2);
                if (offset < rawData.length)
                {
                    const temp = rawData.readUInt16BE(offset);
                    value += (temp & 0xFFFF) << shift;
                    shift += 16;
                }
            }
            else
            {
                found = false;
            }
        }
        if (found)
        {
            if (definition.lookup)
            {
                this.result[title] = this.lookup_value(value, definition.lookup);
            }
            else
            {
                if (definition.offset)
                {
                    value -= definition.offset;
                }
                value *= scale;
                if (this.is_integer_num(value))
                {
                    this.result[title] = parseInt(value, 10);
                }
                else
                {
                    this.result[title] = value;
                }
            }
        }
    }

    lookup_value(value, options)
    {
        let result = 'LOOKUP';
        for (const o of options)
        {
            if (o.mask)
            {
                if (o.key === (value & o.mask))
                {
                    if (result === 'LOOKUP')
                    {
                        result = o.value;
                    }
                    else
                    {
                        result = `${result}, ${o.value}`;
                    }
                }
            }
            else if (o.key === value)
            {
                return o.value;
            }
        }
        return result;
    }

    try_parse_ascii(rawData, definition, start, length)
    {
        const title = definition.name;
        let found = true;
        let value = '';
        for (const r of definition.registers)
        {
            const index = r - start; // get the decimal value of the register'
            if ((index >= 0) && (index < length))
            {
                const offset = OFFSET_PARAMS + (index * 2);
                if (offset < rawData.length)
                {
                    value += rawData.toString('utf8', offset, 2);
                }
            }
            else
            {
                found = false;
            }

            if (found)
            {
                this.result[title] = value;
            }
        }
    }

    try_parse_bits(rawData, definition, start, length)
    {
        const title = definition.name;
        let found = true;
        let value = [];
        for (const r of definition.registers)
        {
            const index = r - start; // get the decimal value of the register'
            if ((index >= 0) && (index < length))
            {
                const offset = OFFSET_PARAMS + (index * 2);
                if (offset < rawData.length)
                {
                    const temp = rawData.readUInt16BE(offset);
                    value = value.concat(temp.toString(16));
                }
            }
            else
            {
                found = false;
            }
        }

        if (found)
        {
            this.result[title] = value;
        }
    }

    get_sensors()
    {
        let result = [];
        for (const i of this._lookups.parameters)
        {
            for (const j of i.items)
            {
                result = result.concat(j);
            }
        }
        return result;
    }

    is_integer_num(value)
    {
        return !Number.isNaN(value)
            && (parseInt(Number(value), 10) === value)
            && !Number.isNaN(parseInt(value, 10));
    }

}

module.exports = ParameterParser;
