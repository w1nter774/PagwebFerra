
import { 
    auth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged 
} from './firebase-config.js';


const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const btnSubmit = document.getElementById('btn-submit');
const alertBox = document.getElementById('alert-box');

const headerLogin = document.getElementById('header-login');
const headerRegister = document.getElementById('header-register');
const toggleBtn = document.getElementById('toggle-btn');
const toggleText = document.getElementById('toggle-text');

let isLoginMode = true;


onAuthStateChanged(auth, (user) => {
    if (user) {
        
        window.location.href = 'dashboard.html';
    }
});


toggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;

    if (isLoginMode) {
        headerLogin.classList.remove('hidden');
        headerRegister.classList.add('hidden');
        btnSubmit.textContent = 'Ingresar';
        toggleText.textContent = '¿No tienes cuenta?';
        toggleBtn.textContent = 'Registrarse';
    } else {
        headerLogin.classList.add('hidden');
        headerRegister.classList.remove('hidden');
        btnSubmit.textContent = 'Registrar';
        toggleText.textContent = '¿Ya tienes cuenta?';
        toggleBtn.textContent = 'Iniciar Sesión';
    }
    showAlert('', ''); 
});


authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log("¡Se hizo clic en ingresar!");
    
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
        showAlert('Algun dato te falto ;)', 'error');
        return;
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Procesando...';

    try {
        if (isLoginMode) {
           
            await signInWithEmailAndPassword(auth, email, password);
            showAlert('Bien, adentro.', 'success');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
        } else {
            
            await createUserWithEmailAndPassword(auth, email, password);
            showAlert('Nuevo usuario creado.', 'success');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
        }
    } catch (error) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = isLoginMode ? 'Ingresar' : 'Registrar';
        handleAuthError(error.code);
    }
});


function showAlert(message, type) {
    if (!message) {
        alertBox.style.display = 'none';
        return;
    }

    alertBox.textContent = message;
    alertBox.className = `alert ${type === 'error' ? 'alert-error' : 'alert-success'}`;
    alertBox.style.display = 'block';
}


function handleAuthError(code) {
    switch (code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            showAlert('Pusiste algo mal :(', 'error');
            break;
        case 'auth/email-already-in-use':
            showAlert('En uso.', 'error');
            break;
        case 'auth/weak-password':
            showAlert('Minimo 6 caracteres.', 'error');
            break;
        case 'auth/invalid-email':
            showAlert('Correo invalido', 'error');
            break;
        default:
            showAlert('Algo paso.', 'error');
            console.error(code);
    }
}