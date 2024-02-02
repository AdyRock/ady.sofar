/* eslint-disable camelcase */
/* eslint-disable no-console */
/* jslint node: true */

'use strict';

// Code based on https://github.com/StephanJoubert/home_assistant_solarman
// From solarman.py

const net = require('node:net');
const ParameterParser = require('./parse');

const sofar_lsw3 = require('./sofar_lsw3.json');
const sofar_g3hyd = require('./sofar_g3hyd.json');
const solis_hybrid = require('./solis_hybrid.json');
const deye_hybrid = require('./deye_hybrid.json');
const sofar_hy_es = require('./sofar_hy_es.json');

const START_OF_MESSAGE = 0xA5;
const END_OF_MESSAGE = 0x15;
const CONTROL_CODE = [0x10, 0x45];
const SERIAL_NO = [0x00, 0x00];
const SEND_DATA_FIELD = [0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
const BIG = false;
const LITTLE = true;

class Inverter
{

    constructor(serial, host, port, mb_slaveid, lookup_file)
    {
        this.busy = false;
        this._serial = serial;
        this._host = host;
        this._port = port;
        this._mb_slaveid = mb_slaveid;
        this._current_val = null;
        this.status_connection = 'Disconnected';
        this.status_lastUpdate = 'N/A';

        if (lookup_file === 'sofar_g3hyd')
        {
            this.parameter_definition = sofar_g3hyd;
        }
        else if (lookup_file === 'solis_hybrid')
        {
            this.parameter_definition = solis_hybrid;
        }
        else if (lookup_file === 'deye_hybrid')
        {
            this.parameter_definition = deye_hybrid;
        }
        else if (lookup_file === 'sofar_hy_es')
        {
            this.parameter_definition = sofar_hy_es;
        }
        else
        {
            this.parameter_definition = sofar_lsw3;
        }

        this.retryRequest = new Uint8Array([165, 23, 0, 16, 69, 0, 0, 101, 120, 45, 138, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 2, 0, 0, 1, 133, 178, 64, 21]);
    }

    setHost(host)
    {
        this._host = host;
    }

    getModbusChksum(data)
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

    intToArray(value, size, littleEndian)
    {
        const serial_hex = value.toString(16).padStart(size, 0);
        const serial_bytes = [];
        for (let c = 0; c < serial_hex.length; c += 2)
        {
            serial_bytes.push(parseInt(serial_hex.substr(c, 2), 16));
        }

        if (littleEndian)
        {
            serial_bytes.reverse();
        }

        return serial_bytes;
    }

    get_serial_hex()
    {
        return this.intToArray(this._serial, 4, LITTLE);
    }

    get_read_business_field(start, length, mb_fc)
    {
        let request_data = [];
        request_data = request_data.concat(this.intToArray(this._mb_slaveid, 2, BIG));
        request_data = request_data.concat(this.intToArray(mb_fc, 2, BIG));
        request_data = request_data.concat(this.intToArray(start, 4, BIG));
        request_data = request_data.concat(this.intToArray(length, 4, BIG));
        const crc = this.getModbusChksum(request_data);
        request_data = request_data.concat(this.intToArray(crc, 4, LITTLE));

        // request_data = bytearray([this._mb_slaveid, mb_fc]); // Function Code
        // request_data.extend(start.to_bytes(2, 'big'));
        // request_data.extend(length.to_bytes(2, 'big'));
        // crc = this.modbus(request_data);
        // request_data.extend(crc.to_bytes(2, 'little'));
        return request_data;
    }

    generate_request(start, length, mb_fc)
    {
        let packet_data = [];
        packet_data = packet_data.concat(SEND_DATA_FIELD);

        const business_field = this.get_read_business_field(start, length, mb_fc);
        packet_data = packet_data.concat(business_field);

        // Header
        let packet = [];
        packet = packet.concat(this.intToArray(packet_data.length, 4, LITTLE));
        packet = packet.concat(CONTROL_CODE);
        packet = packet.concat(SERIAL_NO);
        packet = packet.concat(this.get_serial_hex());
        packet = packet.concat(packet_data);

        // Checksum
        let checksum = 0;
        for (const c of packet)
        {
            checksum += c;
        }

        checksum &= 0xFF;
        packet = packet.concat(this.intToArray(checksum, 2, LITTLE));
        packet = packet.concat(END_OF_MESSAGE);

        return [START_OF_MESSAGE].concat(packet);
    }

    validate_checksum(packet)
    {
        let checksum = 0;
        const { length } = packet;
        // Don't include the checksum and END OF MESSAGE (-2)
        for (let i = 1; i < length - 2; i++)
        {
            checksum += packet[i];
        }
        checksum &= 0xFF;
        if (checksum === packet[length - 2])
        {
            return true;
        }

            return false;
    }

    // Returns -1 if the data is corrupted, 0 if the data is incomplete or the number of bytes to be processed
    validateMODBUSData(MODBUSPacket, mb_functioncode)
    {
        if (MODBUSPacket.length < 3)
        {
            // Not enough data so try to collect some more
            return 0;
        }

        // Now validate the MODBUS data
        if ((MODBUSPacket[0] === 1) && (MODBUSPacket[1] === mb_functioncode))
        {
            // Found a valid MODBUS start so extract the transmitted number of MODBUS data bytes
            const byteCountRequired = MODBUSPacket[2];
            const byteCountReceived = MODBUSPacket.length - 5;
            if (byteCountRequired > byteCountReceived)
            {
                // Not enough data so try to collect some more
                return 0;
            }

            const modbusData = MODBUSPacket.subarray(0, 3 + byteCountRequired); // Get the MODBUSS packet (without the checksum)
            const chkSumCalc = this.getModbusChksum(modbusData); // Calculate the checksum
            const chkSumRx = MODBUSPacket.readUInt16LE(3 + byteCountRequired); // Extract the packet checksum
            if (chkSumCalc === chkSumRx)
            {
                // Valid checksum so return the number of bytes to process
                return byteCountRequired;
            }
        }

        // Bad data
        return -1;
    }

    async send_request(start, end, mb_fc)
    {
        const length = end - start + 1;
        const requestData = this.generate_request(start, length, mb_fc);

        while (this.busy)
        {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        this.busy = true;

        return new Promise((resolve, reject) =>
        {
            let returnData = [];
            const writeBuffer = Buffer.from(requestData);

            const conn = new net.Socket();
            conn.setTimeout(5000);
            conn.connect(this._port, this._host, () =>
            {
                // console.log("Connection writting: ", buffer);
                conn.write(writeBuffer);
            });

            conn.on('data', (data) =>
            {
                if (!this.validate_checksum(data))
                {
                    // console.log('Invalid V5 checksum');
                    conn.destroy();
                    reject(new Error('Invalid V5 checksum'));
                    return;
                }

                // Extract the MODBUS packet
                const modbusSection = data.subarray(25, data.length - 2);
                if ((returnData.length === 0) && (modbusSection[0] !== 1))
                {
                    // Invalid data
                    // console.log('Invalid data', modbusSection);
                    returnData = [];
                    conn.destroy();
                    reject(new Error('Invalid MODBUS packet'));
                    return;
                }
                returnData.push(modbusSection);
                const modbusPacket = Buffer.concat(returnData);

//                console.log("Processing ", modbusPacket);

                const bytesToProcess = this.validateMODBUSData(modbusPacket, mb_fc);
                if (bytesToProcess < 0)
                {
                    // Invalid data
                    // console.log('Invalid data');
                    returnData = [];
                    conn.destroy();
                    reject(new Error('Invalid MODBUS packet'));
                    return;
                }
                if (bytesToProcess > 0)
                {
                    // Extract the data that can be processed
                    const modbusData = modbusPacket.subarray(3, 3 + bytesToProcess);
                    conn.destroy();
                    resolve(modbusData);
                    return;
                }

//                conn.write(this.retryRequest);
                // console.log('Incomplete MODBUS packet');
                returnData = [];
                conn.destroy();
                reject(new Error('Incomplete MODBUS packet'));
            });
            conn.on('end', () =>
            {
                this.busy = false;
            });
            conn.on('close', () =>
            {
                this.busy = false;
            });
            conn.on('error', (err) =>
            {
                // console.log(`Connection error: ${err}`);
                reject(new Error(`Send Error: ${err}`));
            });
            conn.on('timeout', () =>
            {
                console.log('Connection timeout');
                conn.destroy();
                resolve(Buffer.concat(returnData));
            });
        });
    }

    update()
    {
        this.get_statistics();
    }

    async get_statistics()
    {
        let result = true;
        const params = new ParameterParser(this.parameter_definition);
        for (const request of this.parameter_definition.requests)
        {
            try
            {
                this._current_val = await this.send_request(request.start, request.end, request.mb_functioncode);
                params.parse(this._current_val, request.start, (request.end - request.start + 1));
            }
            catch (err)
            {
                console.log('send_request error', err.message);
                result = false;
                break;
            }
        }
        if (result)
        {
            this.status_lastUpdate = new Date(Date.now()).toLocaleString();
            this.status_connection = 'Connected';
            this._current_val = params.get_result();
            return this._current_val;
        }

            this.status_connection = 'Disconnected';
            return null;
    }

    get_current_val()
    {
        return this._current_val;
    }

    get_sensors()
    {
        const params = new ParameterParser(this.parameter_definition);
        return params.get_sensors();
    }

}

module.exports = Inverter;
