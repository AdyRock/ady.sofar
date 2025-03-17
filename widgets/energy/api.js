'use strict';

module.exports = {

	async getSomething({ homey, query })
	{
		const energy = await homey.app.getWidgetEnergyValues(query.solarDeviceId, query.batteryDeviceId, query.gridDeviceId, query.homeDeviceId);
		return energy;
	},

	async addSomething({ homey, body })
	{
		// access the post body and perform some action on it.

		return homey.app.addSomething(body);
	},

	async updateSomething({ homey, params, body })
	{
		return homey.app.setSomething(body);
	},

	async deleteSomething({ homey, params })
	{
		return homey.app.deleteSomething(params.id);
	},

};
