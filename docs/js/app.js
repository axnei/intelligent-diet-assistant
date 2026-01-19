const loginSection = document.getElementById("loginSection");
const appSection = document.getElementById("appSection");

const loginInput = document.getElementById("login");
const passInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginError = document.getElementById("loginError");

const calcBtn = document.getElementById("calcBtn");
const resultDiv = document.getElementById("result");

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

calcBtn.addEventListener("click", () => {
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

  resultDiv.innerHTML = `
    <b>Результаты расчёта</b><br>
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
