document.addEventListener("DOMContentLoaded", () => {
  // If already logged in, skip straight to the dashboard.
  if (Auth.getToken()) {
    window.location.href = "dashboard.html";
    return;
  }

  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const formLogin = document.getElementById("form-login");
  const formRegister = document.getElementById("form-register");
  const title = document.getElementById("auth-title");
  const sub = document.getElementById("auth-sub");
  const errorBox = document.getElementById("auth-error");

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.add("visible");
  }
  function clearError() {
    errorBox.classList.remove("visible");
    errorBox.textContent = "";
  }

  function setMode(mode) {
    clearError();
    const isLogin = mode === "login";
    tabLogin.classList.toggle("active", isLogin);
    tabRegister.classList.toggle("active", !isLogin);
    formLogin.classList.toggle("active", isLogin);
    formRegister.classList.toggle("active", !isLogin);
    title.textContent = isLogin ? "Welcome back" : "Create your account";
    sub.textContent = isLogin ? "Sign in to your projects." : "Start planning with AI-assisted task breakdowns.";
  }

  tabLogin.addEventListener("click", () => setMode("login"));
  tabRegister.addEventListener("click", () => setMode("register"));

  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const submitBtn = formLogin.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in…";
    try {
      const data = await apiRequest("/auth/login-json", {
        method: "POST",
        auth: false,
        body: { email, password },
      });
      Auth.setSession(data.access_token, data.user);
      window.location.href = "dashboard.html";
    } catch (err) {
      showError(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign in";
    }
  });

  formRegister.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const name = document.getElementById("reg-name").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const submitBtn = formRegister.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating account…";
    try {
      const data = await apiRequest("/auth/register", {
        method: "POST",
        auth: false,
        body: { name, email, password },
      });
      Auth.setSession(data.access_token, data.user);
      window.location.href = "dashboard.html";
    } catch (err) {
      showError(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create account";
    }
  });
});
