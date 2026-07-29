// ============================================
// WebSense AI Login Script
// ============================================

// Get Elements
const loginForm = document.getElementById("loginForm");
const password = document.getElementById("password");
const togglePassword = document.getElementById("togglePassword");
const loginButton = document.querySelector(".login-btn");

// ============================================
// Show / Hide Password
// ============================================

togglePassword.addEventListener("click", () => {

    if (password.type === "password") {

        password.type = "text";

        togglePassword.classList.remove("fa-eye");
        togglePassword.classList.add("fa-eye-slash");

    } else {

        password.type = "password";

        togglePassword.classList.remove("fa-eye-slash");
        togglePassword.classList.add("fa-eye");

    }

});

// ============================================
// Login Form
// ============================================

loginForm.addEventListener("submit", function (e) {

    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const pass = password.value.trim();

    if (email === "") {

        alert("Please enter your email.");

        return;

    }

    if (!email.includes("@")) {

        alert("Please enter a valid email address.");

        return;

    }

    if (pass === "") {

        alert("Please enter your password.");

        return;

    }

    // Loading Animation

    loginButton.disabled = true;

    loginButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Signing In...
    `;

    setTimeout(() => {

        loginButton.innerHTML = "Login";

        loginButton.disabled = false;

        // Temporary Redirect
        // Replace this later with Flask route

        window.location.href = "dashboard.html";

    }, 1800);

});

// ============================================
// Social Buttons
// ============================================

const googleBtn = document.querySelector(".google");
const githubBtn = document.querySelector(".github");

googleBtn.addEventListener("click", () => {

    alert("Google Authentication will be added in Phase 2.");

});

githubBtn.addEventListener("click", () => {

    alert("GitHub Authentication will be added in Phase 2.");

});

// ============================================
// Input Focus Animation
// ============================================

const inputs = document.querySelectorAll(".input-box input");

inputs.forEach(input => {

    input.addEventListener("focus", () => {

        input.parentElement.style.transform = "scale(1.02)";

    });

    input.addEventListener("blur", () => {

        input.parentElement.style.transform = "scale(1)";

    });

});

// ============================================
// Welcome Message
// ============================================

console.log("🚀 WebSense AI Login Loaded Successfully");