const loginSection = document.getElementById("loginSection");
const appSection = document.getElementById("appSection");

const loginInput = document.getElementById("login");
const passInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginError = document.getElementById("loginError");

const calcBtn = document.getElementById("calcBtn");
const resultDiv = document.getElementById("result");

// --- ML clusters dataset (loaded from GitHub Pages) ---
let CLUSTERS_DATA = null;

async function loadClusters() {
  if (CLUSTERS_DATA) return CLUSTERS_DATA;

  const resp = await fetch("data/clusters.json", { cache: "no-store" });
  if (!resp.ok) {
    throw new Error("Не удалось загрузить data/clusters.json (проверь путь и публикацию Pages).");
  }
  CLUSTERS_DATA = await resp.json();
  return CLUSTERS_DATA;
}
function pickClusterForGoal(summaryRows, goal) {
  // summaryRows: [{cluster, calories, protein, fat, carbs, fiber}]
  // Простая логика выбора:
  // lose -> минимальные калории + выше клетчатка
  // gain -> максимальные калории
  // maintain -> "средний" кластер по калориям

  const byCalories = [...summaryRows].sort((a, b) => a.calories - b.calories);

  if (goal === "lose") {
    // среди самых низкокалорийных берём тот, где клетчатка выше
    const low = byCalories.slice(0, Math.min(2, byCalories.length));
    return low.sort((a, b) => b.fiber - a.fiber)[0].cluster;
  }

  if (goal === "gain") {
    return byCalories[byCalories.length - 1].cluster;
  }

  // maintain: средний по калориям
  return byCalories[Math.floor(byCalories.length / 2)].cluster;
}

function buildClusterSummary(items) {
  // items: [{cluster, calories, protein, fat, carbs, fiber}]
  const map = new Map();
  for (const it of items) {
    if (!map.has(it.cluster)) {
      map.set(it.cluster, { cluster: it.cluster, n: 0, calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 });
    }
    const s = map.get(it.cluster);
    s.n += 1;
    s.calories += it.calories;
    s.protein += it.protein;
    s.fat += it.fat;
    s.carbs += it.carbs;
    s.fiber += it.fiber;
  }
  const rows = [];
  for (const s of map.values()) {
    rows.push({
      cluster: s.cluster,
      calories: s.calories / s.n,
      protein: s.protein / s.n,
      fat: s.fat / s.n,
      carbs: s.carbs / s.n,
      fiber: s.fiber / s.n,
    });
  }
  return rows;
}
function chooseRandom(arr, n) {
  const a = [...arr];
  // простой shuffle
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function gramsForKcalFrom100g(food, kcalTarget) {
  const kcalPerG = food.calories / 100;
  const g = kcalTarget / kcalPerG;
  return Math.max(30, Math.round(g));
}

function buildMealFromFoods(title, foods, kcalTarget) {
  // распределим калории по продуктам равномерно
  const perItem = kcalTarget / foods.length;

  const items = foods.map(f => {
    const grams = gramsForKcalFrom100g(f, perItem);
    const kcal = Math.round(f.calories * grams / 100);
    return { name: f.food, grams, kcal };
  });

  const total = items.reduce((s, x) => s + x.kcal, 0);
  return { title, totalKcal: total, items };
}

async function mealPlanUsingML(targetKcal, goal) {
  const data = await loadClusters();

  const items = data.items.map(x => ({
    food: x.food,
    cluster: x.cluster,
    calories: x.calories,
    protein: x.protein,
    fat: x.fat,
    carbs: x.carbs,
    fiber: x.fiber,
  }));

  const summary = buildClusterSummary(items);
  const chosenCluster = pickClusterForGoal(summary, goal);

  const pool = items.filter(x => x.cluster === chosenCluster);

  // распределение по приёмам пищи
  const dist = { breakfast: 0.28, lunch: 0.35, dinner: 0.27, snack: 0.10 };

  // выбираем продукты для каждого приема пищи
  const breakfastFoods = chooseRandom(pool, 3);
  const lunchFoods = chooseRandom(pool, 3);
  const dinnerFoods = chooseRandom(pool, 3);
  const snackFoods = chooseRandom(pool, 2);

  const plan = [
    buildMealFromFoods("Завтрак", breakfastFoods, targetKcal * dist.breakfast),
    buildMealFromFoods("Обед", lunchFoods, targetKcal * dist.lunch),
    buildMealFromFoods("Ужин", dinnerFoods, targetKcal * dist.dinner),
    buildMealFromFoods("Перекус", snackFoods, targetKcal * dist.snack),
  ];

  return { plan, chosenCluster, summary };
}

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function setLoggedIn(isLoggedIn) {
  if (isLoggedIn) {
    hide(loginSection);
    show(appSection);
  } else {
    show(loginSection);
    hide(appSection);
  }
}

// --- Prototype auth (for demo) ---
loginBtn.addEventListener("click", () => {
  const u = (loginInput.value || "").trim();
  const p = (passInput.value || "").trim();

  loginError.textContent = "";

  const ok = (p === "1234") && (u === "user" || u === "admin");
  if (!ok) {
    loginError.textContent = "Неверный логин или пароль.";
    return;
  }

  localStorage.setItem("demoUser", u);
  setLoggedIn(true);
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("demoUser");
  setLoggedIn(false);
});

// Auto-login if already set
setLoggedIn(!!localStorage.getItem("demoUser"));

// --- Nutrition logic (Mifflin–St Jeor) ---
function mifflinStJeor({ sex, weightKg, heightCm, ageYears }) {
  // BMR
  const s = sex === "male" ? 5 : -161;
  return (10 * weightKg) + (6.25 * heightCm) - (5 * ageYears) + s;
}

function applyGoal(tdee, goal) {
  if (goal === "lose") return tdee * 0.85;     // deficit
  if (goal === "gain") return tdee * 1.10;     // surplus
  return tdee;                                 // maintain
}

function macroTargets(kcal) {
  // simple split: 30% protein, 30% fat, 40% carbs
  const proteinKcal = kcal * 0.30;
  const fatKcal = kcal * 0.30;
  const carbKcal = kcal * 0.40;

  return {
    proteinG: Math.round(proteinKcal / 4),
    fatG: Math.round(fatKcal / 9),
    carbsG: Math.round(carbKcal / 4),
  };
}
// --- Simple food database (per 100g) ---
const FOODS = [
  { name: "Овсянка", kcal: 367, p: 12.3, f: 6.1, c: 61.8 },
  { name: "Греческий йогурт 2%", kcal: 73, p: 10.0, f: 2.0, c: 3.6 },
  { name: "Яйцо куриное", kcal: 155, p: 13.0, f: 11.0, c: 1.1 },
  { name: "Банан", kcal: 89, p: 1.1, f: 0.3, c: 23.0 },
  { name: "Яблоко", kcal: 52, p: 0.3, f: 0.2, c: 14.0 },
  { name: "Куриная грудка", kcal: 165, p: 31.0, f: 3.6, c: 0.0 },
  { name: "Рис", kcal: 130, p: 2.7, f: 0.3, c: 28.0 },
  { name: "Гречка", kcal: 110, p: 3.6, f: 1.2, c: 21.0 },
  { name: "Творог 5%", kcal: 121, p: 17.0, f: 5.0, c: 3.0 },
  { name: "Лосось", kcal: 208, p: 20.0, f: 13.0, c: 0.0 },
  { name: "Овощной салат", kcal: 45, p: 1.2, f: 0.2, c: 9.0 },
  { name: "Брокколи", kcal: 34, p: 2.8, f: 0.4, c: 7.0 },
  { name: "Оливковое масло", kcal: 884, p: 0.0, f: 100.0, c: 0.0 },
  { name: "Хлеб цельнозерновой", kcal: 247, p: 13.0, f: 4.2, c: 41.0 },
  { name: "Орехи (микс)", kcal: 600, p: 20.0, f: 50.0, c: 20.0 },
];

// helper: grams for target kcal for a given food
function gramsForKcal(food, kcalTarget) {
  // kcal per 1g:
  const kcalPerG = food.kcal / 100;
  const g = kcalTarget / kcalPerG;
  return Math.max(20, Math.round(g)); // keep reasonable minimum
}

function mealPlanForDay(targetKcal) {
  // simple meal distribution
  const dist = {
    breakfast: 0.28,
    lunch: 0.35,
    dinner: 0.27,
    snack: 0.10,
  };

  const picks = {
    breakfast: [FOODS[0], FOODS[1], FOODS[4]], // oats + yogurt + apple
    lunch: [FOODS[5], FOODS[6], FOODS[11]],    // chicken + rice + broccoli
    dinner: [FOODS[9], FOODS[7], FOODS[10]],   // salmon + buckwheat + salad
    snack: [FOODS[8], FOODS[3]],               // cottage cheese + banana
  };

  function buildMeal(mealKey, title) {
    const kcalMeal = targetKcal * dist[mealKey];
    const items = picks[mealKey];

    // split calories between items: 50/30/20 (or 60/40 for snack)
    const splits = mealKey === "snack" ? [0.6, 0.4] : [0.5, 0.3, 0.2];

    const mealItems = items.map((food, idx) => {
      const grams = gramsForKcal(food, kcalMeal * splits[idx]);
      const kcal = Math.round(food.kcal * grams / 100);
      return { food, grams, kcal };
    });

    const totalKcal = mealItems.reduce((s, x) => s + x.kcal, 0);

    return { title, totalKcal, items: mealItems };
  }

  return [
    buildMeal("breakfast", "Завтрак"),
    buildMeal("lunch", "Обед"),
    buildMeal("dinner", "Ужин"),
    buildMeal("snack", "Перекус"),
  ];
}

calcBtn.addEventListener("click", async () => {

  const sex = document.getElementById("sex").value;
  const age = Number(document.getElementById("age").value);
  const height = Number(document.getElementById("height").value);
  const weight = Number(document.getElementById("weight").value);
  const activity = Number(document.getElementById("activity").value);
  const goal = document.getElementById("goal").value;

  if (!age || !height || !weight) {
    resultDiv.textContent = "Пожалуйста, заполните все поля корректно.";
    show(resultDiv);
    return;
  }

  const bmr = mifflinStJeor({ sex, weightKg: weight, heightCm: height, ageYears: age });
  const tdee = bmr * activity;
  const targetKcal = applyGoal(tdee, goal);

  const macros = macroTargets(targetKcal);
  // ML-based plan
  let mlBlockHtml = "";
  try {
    const ml = await mealPlanUsingML(targetKcal, goal);

    const planHtml = ml.plan.map(m => {
      const itemsHtml = m.items.map(i =>
        `<li>${i.name} — <b>${i.grams} г</b> (≈ ${i.kcal} ккал)</li>`
      ).join("");

      return `
        <div class="result" style="margin-top:12px;">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
            <b>${m.title}</b>
            <span class="badge">≈ ${m.totalKcal} ккал</span>
          </div>
          <ul style="margin:10px 0 0; padding-left: 18px;">
            ${itemsHtml}
          </ul>
        </div>
      `;
    }).join("");

    mlBlockHtml = `
      <br><b>Рацион на день (на основе ML-кластеризации продуктов)</b><br>
      <span class="badge">Выбран кластер: ${ml.chosenCluster}</span>
      ${planHtml}
      <p class="hint">Примечание: продукты подбираются из группы (кластера), выбранной по цели питания.</p>
    `;
  } catch (e) {
    mlBlockHtml = `<p class="hint">ML-модуль пока недоступен: ${e.message}</p>`;
  }

    const plan = mealPlanForDay(targetKcal);

  const planHtml = plan.map(m => {
    const itemsHtml = m.items.map(i =>
      `<li>${i.food.name} — <b>${i.grams} г</b> (≈ ${i.kcal} ккал)</li>`
    ).join("");

    return `
      <div class="result" style="margin-top:12px;">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
          <b>${m.title}</b>
          <span class="badge">≈ ${m.totalKcal} ккал</span>
        </div>
        <ul style="margin:10px 0 0; padding-left: 18px;">
          ${itemsHtml}
        </ul>
      </div>
    `;
  }).join("");

  resultDiv.innerHTML = mlBlockHtml`
    <b>Результаты расчёта</b><br>
    BMR: ${Math.round(bmr)} ккал/сут<br>
    Суточная норма (с учётом активности): ${Math.round(tdee)} ккал/сут<br>
    <b>Рекомендованная калорийность:</b> ${Math.round(targetKcal)} ккал/сут<br><br>

    <b>Целевые БЖУ:</b><br>
    Белки: ${macros.proteinG} г/сут<br>
    Жиры: ${macros.fatG} г/сут<br>
    Углеводы: ${macros.carbsG} г/сут<br><br>

    <b>Пример рациона на день</b>
    ${planHtml}
  `;

    BMR: ${Math.round(bmr)} ккал/сут<br>
    Суточная норма (с учётом активности): ${Math.round(tdee)} ккал/сут<br>
    <b>Рекомендованная калорийность:</b> ${Math.round(targetKcal)} ккал/сут<br><br>
    <b>Целевые БЖУ:</b><br>
    Белки: ${macros.proteinG} г/сут<br>
    Жиры: ${macros.fatG} г/сут<br>
    Углеводы: ${macros.carbsG} г/сут
  `;
  show(resultDiv);
});
