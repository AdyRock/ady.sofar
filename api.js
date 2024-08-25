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

		homey.app.GetMultipleRegisterValues(body.start, body.count);
		return 'Working on it...\n';
	},
};
