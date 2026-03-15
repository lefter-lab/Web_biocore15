// frontend/src/js/calc.js

export const CONFIG = {
	MAX_GLYCOGEN: 500.0,
	FAT_CONVERSION_EFFICIENCY: 0.25,
	DIGESTIVE_DELAY_MINS: 15,
	// Скорости на абсорбция в грам на минута (g/min)
	ABSORPTION_RATES: {
		fastCarbs: 1.0,  // 60g/h
		slowCarbs: 0.33, // 20g/h
		proteins: 0.25,  // 15g/h
		fats: 0.08       // 5g/h
	}
};

// Функция за изчисляване на BMR (Mifflin-St Jeor)
export function calculateBMR(weight, height, age, gender) {
	let bmr = (10 * weight) + (6.25 * height) - (5 * age);
	return gender === 'male' ? bmr + 5 : bmr - 161;
}

// Изчислява колко грама се изгарят за 1 минута спрямо пулса
export function calculateMinuteBurn(hr, bmr, activeKcalDay) {
	const totalKcalMin = (bmr + activeKcalDay) / 1440;
	let carbsPct = 0.5; // Базово 50%
    
	if (hr > 150) carbsPct = 0.9;      // Зона за захари
	else if (hr > 120) carbsPct = 0.7; // Смесена
	else if (hr < 75) carbsPct = 0.3;  // Зона за мазнини

	return (totalKcalMin * carbsPct) / 4; // връща грамове гликоген
}

// Логика за преливане към мазнини (Spillover)
export function calculateGlycogenUpdate(currentGlycogen, absorbedGrams) {
	let newGlycogen = currentGlycogen + absorbedGrams;
	let addedToFat = 0;

	if (newGlycogen > CONFIG.MAX_GLYCOGEN) {
		let overflow = newGlycogen - CONFIG.MAX_GLYCOGEN;
		newGlycogen = CONFIG.MAX_GLYCOGEN;
		addedToFat = overflow * CONFIG.FAT_CONVERSION_EFFICIENCY;
	}

	return {
		newGlycogen: Math.max(0, newGlycogen),
		addedToFat: addedToFat
	};
}
