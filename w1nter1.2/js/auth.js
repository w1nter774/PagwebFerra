import {
    auth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged
} from './firebase-config.js';

const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitButton = document.getElementById('btn-submit');
const alertBox = document.getElementById('alert-box');
const loginHeader = document.getElementById('header-login');
const registerHeader = document.getElementById('header-register');
const toggleButton = document.getElementById('toggle-btn');
const toggleText = document.getElementById('toggle-text');

const requiredElements = [
    authForm,
    emailInput,
    passwordInput,
    submitButton,
    alertBox,
    loginHeader,
    registerHeader,
    toggleButton,
    toggleText
];

if (requiredElements.some((element) => !element)) {
    console.error('No se pudo iniciar el formulario: faltan elementos requeridos en index.html.');
} else {
    let isLoginMode = true;
    let isSubmitting = false;

    onAuthStateChanged(
        auth,
        (user) => {
            if (user) {
                window.location.replace('dashboard.html');
            }
        },
        (error) => {
            console.error('No se pudo comprobar la sesión:', error);
            showAlert('No se pudo comprobar tu sesión. Recarga la página e inténtalo de nuevo.', 'error');
        }
    );

    toggleButton.addEventListener('click', (event) => {
        event.preventDefault();
        if (isSubmitting) return;

        isLoginMode = !isLoginMode;
        loginHeader.classList.toggle('hidden', !isLoginMode);
        loginHeader.setAttribute('aria-hidden', String(!isLoginMode));
        registerHeader.classList.toggle('hidden', isLoginMode);
        registerHeader.setAttribute('aria-hidden', String(isLoginMode));

        submitButton.textContent = isLoginMode ? 'Iniciar sesión' : 'Crear cuenta';
        toggleText.textContent = isLoginMode ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?';
        toggleButton.textContent = isLoginMode ? 'Registrarse' : 'Iniciar sesión';
        passwordInput.autocomplete = isLoginMode ? 'current-password' : 'new-password';
        passwordInput.value = '';
        showAlert('');
    });

    authForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (isSubmitting) return;

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showAlert('Completa el correo electrónico y la contraseña.', 'error');
            return;
        }

        if (!emailInput.checkValidity() || !passwordInput.checkValidity()) {
            showAlert('Ingresa un correo válido y una contraseña de al menos 6 caracteres.', 'error');
            return;
        }

        setSubmitting(true);
        showAlert('Conectando…', 'info');

        try {
            if (isLoginMode) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
            window.location.replace('dashboard.html');
        } catch (error) {
            setSubmitting(false);
            showAlert(getAuthErrorMessage(error?.code), 'error');
        }
    });

    function setSubmitting(submitting) {
        isSubmitting = submitting;
        submitButton.disabled = submitting;
        toggleButton.setAttribute('aria-disabled', String(submitting));
        submitButton.textContent = submitting
            ? 'Procesando…'
            : (isLoginMode ? 'Iniciar sesión' : 'Crear cuenta');
    }

    function showAlert(message, type = '') {
        alertBox.textContent = message;
        alertBox.className = type ? `alert alert-${type}` : 'alert';
        alertBox.hidden = !message;
        alertBox.setAttribute('role', type === 'error' ? 'alert' : 'status');
    }

    function getAuthErrorMessage(code) {
        switch (code) {
            case 'auth/invalid-email':
                return 'El correo electrónico no tiene un formato válido.';
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                return 'El correo o la contraseña no son correctos.';
            case 'auth/email-already-in-use':
                return 'Ya existe una cuenta con ese correo electrónico.';
            case 'auth/weak-password':
                return 'La contraseña debe tener al menos 6 caracteres.';
            case 'auth/too-many-requests':
                return 'Hubo demasiados intentos. Espera un momento y vuelve a probar.';
            case 'auth/network-request-failed':
                return 'No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.';
            case 'auth/operation-not-allowed':
                return 'Este método de acceso no está habilitado en Firebase.';
            default:
                console.error('Error de autenticación:', code);
                return 'No se pudo completar el acceso. Inténtalo de nuevo.';
        }
    }
}
