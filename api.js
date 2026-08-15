'use strict';

module.exports = {
	async getLog({ homey })
	{
		return homey.app.diagLog;
	},
	async getDetect({ homey })
	{
		return homey.app.detectedDevices;
	},
	async clearLog({ homey })
	{
		homey.app.diagLog = '';
		return 'OK';
	},
	async sendLog({ homey, body })
	{
		return homey.app.sendLog(body);
	},
	async getRegisterLog({ homey })
	{
		return homey.app.getRegisterLog();
	},
	async getRegisterLogging({ homey })
	{
		return homey.app.getRegisterLogging();
	},
	async getRegisters({ homey, body })
	{
		if (body.start === 'stop')
		{
			homey.app.StopReadingRegisters();
			return 'Stopping...\n';
		}

		if (body.start === 'clear')
		{
			homey.app.clearRegisterLog();
			return 'The Log has been deleted\n';
		}

		const start = Number.parseInt(body.start, 10);
		const count = Number.parseInt(body.count, 10);
		if (!Number.isInteger(start) || (start < 0) || (start > 65535))
		{
			throw new Error('Start register must be an integer between 0 and 65535');
		}
		if (!Number.isInteger(count) || (count < 1) || (count > 1000))
		{
			throw new Error('Register count must be an integer between 1 and 1000');
		}
		if ((start + count - 1) > 65535)
		{
			throw new Error('Requested register range exceeds 65535');
		}

		homey.app.GetMultipleRegisterValues(start, count);
		return 'Working on it...\n';
	},
};
