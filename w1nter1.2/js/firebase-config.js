// Importa las funciones necesarias desde los SDKs de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    setDoc, 
    getDocs, 
    deleteDoc, 
    doc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Configuración de tu proyecto en Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBwkLsjBTpfMWabMA6UV-L-Nf5_pX5x8Bg",
  authDomain: "ferra-42897.firebaseapp.com",
  projectId: "ferra-42897",
  storageBucket: "ferra-42897.firebasestorage.app",
  messagingSenderId: "884881491186",
  appId: "1:884881491186:web:fcdea3ad14f3efff19bc6b"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Exportar los módulos para usarlos en el dashboard y auth
export { 
    auth, 
    db, 
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut, 
    onAuthStateChanged, 
    collection, 
    addDoc, 
    setDoc, 
    getDocs, 
    deleteDoc, 
    doc 
};