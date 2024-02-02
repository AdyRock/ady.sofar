/* eslint-disable no-use-before-define */
/* eslint-disable no-console */
/* eslint-disable camelcase */
/* eslint-disable max-classes-per-file */
/* jslint node: true */

'use strict';

// Code based on https://github.com/StephanJoubert/home_assistant_solarman
// From sensor.py

/// ///////////////////////////////////////////////////////////////////////////
//   Solarman local interface.
//
//   This component can retrieve data from the solarman dongle using version 5
//   of the protocol.
//
/// ///////////////////////////////////////////////////////////////////////////
const Inverter = require('./inverter');

class Sensor
{

    constructor(inverter_sn, inverter_host, inverter_port, inverter_mb_slaveid, lookup_file)
    {
        this.inverter_name = 'Adrian';
        this.inverter_sn = inverter_sn;
        this.inverter = new Inverter(inverter_sn, inverter_host, inverter_port, inverter_mb_slaveid, lookup_file);
        this.getSensors();
    }

    setHost(inverter_host)
    {
        this.inverter.setHost(inverter_host);
    }

    async getSensors()
    {
        //  Prepare the sensor entities.
        let sensors = [];
        for (const sensor of this.inverter.get_sensors())
        {
            if (sensor.isstr)
            {
                sensors = sensors.concat(new SolarmanSensorText(this.inverter_name, this.inverter, sensor, this.inverter_sn));
            }
            else
            {
                sensors = sensors.concat(new SolarmanSensor(this.inverter_name, this.inverter, sensor, this.inverter_sn));
            }
        }

        sensors = sensors.concat(new SolarmanStatus(this.inverter_name, this.inverter, 'status_lastUpdate', this.inverter_sn));
        sensors = sensors.concat(new SolarmanStatus(this.inverter_name, this.inverter, 'status_connection', this.inverter_sn));

        // console.log(sensors);
        return sensors;
    }

    async getStatistics()
    {
        return this.inverter.get_statistics();
    }

    async getRegisterValue(registerNumber)
    {
        const result = await this.inverter.send_request(registerNumber, registerNumber, 3);
        return result.readInt16BE(0);
    }

    getSerial()
    {
        return this.inverter_sn;
    }

}

module.exports = Sensor;

/// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// This is the entity seen by Home Assistant.
//  It derives from the Entity class in HA and is suited for status values.
/// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

class SolarmanStatus
{

    constructor(inverter_name, inverter, field_name, sn)
    {
        this._inverter_name = inverter_name;
        this.inverter = inverter;
        this._field_name = field_name;
        this.p_state = null;
        this._sn = sn;
    }

    // @property
    // get icon()
    // {
    //     //  Return the icon of the sensor. """
    //     return this.p_icon;
    // }

    // @property
    get name()
    {
        //  Return the name of the sensor.
        return '{} {}'.format(this._inverter_name, this._field_name);
    }

    // @property
    get unique_id()
    {
        // Return a unique_id based on the serial number
        return '{}_{}_{}'.format(this._inverter_name, this._sn, this._field_name);
    }

    // @property
    get state()
    {
        //  Return the state of the sensor.
        return this.p_state;
    }

    update()
    {
        // this.p_state = getattr(this.inverter, this._field_name);
    }

    /// ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //  Entity displaying a text field read from the inverter
    //   Overrides the Status entity, supply the configured icon, and updates the inverter parameters
    /// ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}

class SolarmanSensorText extends SolarmanStatus
{

    constructor(inverter_name, inverter, sensor, sn)
    {
        super(inverter_name, inverter, sensor.name, sn);
    }

    update()
    {
        //  Update this sensor using the data.
        //  Get the latest data and use it to update our sensor state.
        //  Retrieve the sensor data from actual interface
        this.inverter.update();

        const val = this.inverter.get_current_val();
        if (val !== null)
        {
            if (this._field_name in val)
            {
                this.p_state = val[this._field_name];
            }
        }
    }

}

/// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  Entity displaying a numeric field read from the inverter
//   Overrides the Text sensor and supply the device class, last_reset and unit of measurement
/// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

class SolarmanSensor extends SolarmanSensorText
{

    constructor(inverter_name, inverter, sensor, sn)
    {
        super(inverter_name, inverter, sensor, sn);
        this.uom = sensor.uom;
    }

    // @property
    unit_of_measurement()
    {
        return this.uom;
    }

}
