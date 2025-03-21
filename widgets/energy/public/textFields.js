

class TextFields
{

	#ctx;
	#leftAlign;
	#textX;
	#textY;
	#powerValue;
	#powerUnit;
	#toDeviceValue;
	#toDeviceUnit;
	#fromDeviceValue;
	#fromDeviceUnit;
	#chargeValue;
	#chargeUnit;
	#foreColor;

	constructor(ctx, x, y, align, foreColor)
	{
		this.#ctx = ctx;
		this.#leftAlign = align;
		this.#textX = x;
		this.#textY = y;
		this.#powerValue = 0;
		this.#toDeviceValue = null;
		this.#fromDeviceValue = null;
		this.#chargeValue = null;
		this.#powerUnit = 'W';
		this.#toDeviceUnit = 'kW/h';
		this.#fromDeviceUnit = 'kW/h';
		this.#chargeUnit = 'kW/h';
		this.#foreColor = foreColor;
	}

	setXY(x, y)
	{
		this.#textX = x;
		this.#textY = y;
	}

	draw()
	{
		let textY = this.#textY;

		// Check if the side value is a number and draw it
		if (typeof this.#powerValue === 'number')
		{
			this.#ctx.font = '20px Arial';
			this.#ctx.fillStyle = this.#foreColor;
			const textMeasurements = this.#ctx.measureText(`${this.#powerValue}${this.#powerUnit}`);
			const textHeight = textMeasurements.actualBoundingBoxAscent + textMeasurements.actualBoundingBoxDescent;

			// Move the text down for the next line
			textY += textHeight + 10;

			// Draw the side value beside the image
			if (this.#leftAlign)
			{
				// Draw the value to the right
				this.#ctx.fillText(`${this.#powerValue > 0 ? '→' : this.#powerValue === 0 ? '' : '←'} ${Math.abs(this.#powerValue)}${this.#powerUnit}`, this.#textX, textY);
			}
			else
			{
				// Draw the value to the left
				const textWidth = textMeasurements.width;
				this.#ctx.fillText(`${this.#powerValue > 0 ? '←' : this.#powerValue === 0 ? '' : '→'} ${Math.abs(this.#powerValue)}${this.#powerUnit}`, this.#textX - textWidth, textY);
			}

			if (typeof this.#fromDeviceValue !== 'number')
			{
				textY += 5;
			}
		}

		if (typeof this.#toDeviceValue === 'number')
		{
			this.#ctx.font = '15px Arial';
			this.#ctx.fillStyle = this.#foreColor;
			const textMeasurements = this.#ctx.measureText(`${this.#toDeviceValue}${this.#toDeviceUnit}`);
			const textHeight = textMeasurements.actualBoundingBoxAscent + textMeasurements.actualBoundingBoxDescent;

			// Move the text down for the next line
			textY += textHeight + 10;

			// Draw the imported power value beside the image
			if (this.#leftAlign)
			{
				// The image is on the left side of the screen so draw the value to the right of the image
				this.#ctx.fillText(`← ${this.#toDeviceValue}${this.#toDeviceUnit}`, this.#textX, textY);
			}
			else
			{
				// the image is on the right side of the screen so draw the value to the left of the image so work out the width of the text and subtract it from the x position
				const textWidth = textMeasurements.width;
				this.#ctx.fillText(`${this.#toDeviceValue}${this.#toDeviceUnit} →`, this.#textX - textWidth, textY);
			}
		}
		else
		{
			textY += 5;
		}

		if (typeof this.#fromDeviceValue === 'number')
		{
			this.#ctx.font = '15px Arial';
			this.#ctx.fillStyle = this.#foreColor;
			const textMeasurements = this.#ctx.measureText(`${this.#fromDeviceValue}${this.#fromDeviceUnit}`);
			const textHeight = textMeasurements.actualBoundingBoxAscent + textMeasurements.actualBoundingBoxDescent;

			// Move the text down for the next line
			textY += textHeight + 10;

			// Draw the exported power value beside the image
			if (this.#leftAlign)
			{
				// The image is on the left side of the screen so draw the value to the right of the image
				this.#ctx.fillText(`→ ${this.#fromDeviceValue}${this.#fromDeviceUnit}`, this.#textX, textY);
			}
			else
			{
				// the image is on the right side of the screen so draw the value to the left of the image so work out the width of the text and subtract it from the x position
				const textWidth = textMeasurements.width;
				this.#ctx.fillText(`${this.#fromDeviceValue}${this.#fromDeviceUnit} ←`, this.#textX - textWidth, textY);
			}
		}

		// Check if the charge value is a number and draw it
		if (typeof this.#chargeValue === 'number')
		{
			this.#ctx.font = '15px Arial';
			this.#ctx.fillStyle = this.#foreColor;

			if (this.#leftAlign)
			{
				// Daw the value centered about the image width above the image so work out the width of the text and subtract it from the x position
				const textWidth = this.#ctx.measureText(`${this.#chargeValue}${this.#chargeUnit}`).width;
				this.#ctx.fillText(`${this.#chargeValue}${this.#chargeUnit}`, (this.#textX - 25) - (textWidth / 2), this.#textY + 20);
			}
			else
			{
				// Draw the value centered about the image width above the image
				this.#ctx.fillText(`${this.#chargeValue}${this.#chargeUnit}`, this.#textX, this.#textY + 20);
			}
		}
	}

	setPowerValue(value, unit)
	{
		this.#powerValue = value;
		this.#powerUnit = unit;
	}

	setToDeviceValue(value, unit)
	{
		this.#toDeviceValue = value;
		this.#toDeviceUnit = unit;
	}

	setFromDeviceValue(value, unit)
	{
		this.#fromDeviceValue = value;
		this.#fromDeviceUnit = unit;
	}

	setChargeValue(value, unit)
	{
		this.#chargeValue = value;
		this.#chargeUnit = unit;
	}

}

export { TextFields };
