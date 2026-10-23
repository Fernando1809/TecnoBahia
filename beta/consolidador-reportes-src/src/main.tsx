import { createRoot } from "react-dom/client";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import App from "./App";
import "./styles.css";

const firebaseApp = initializeApp({
	apiKey: "AIzaSyB1gb9Q_3FfsEhES1QfliYd_SHtHz9VY5g",
	authDomain: "tecnobahiainventario.firebaseapp.com",
	projectId: "tecnobahiainventario",
	storageBucket: "tecnobahiainventario.firebasestorage.app",
	messagingSenderId: "1086497196310",
	appId: "1:1086497196310:web:b7bbd2ccbe3bb2ad842837",
});

const root = createRoot(document.getElementById("root")!);
const auth = getAuth(firebaseApp);

onAuthStateChanged(auth, (user) => {
	if (!user) {
		window.location.replace("../index.html");
		return;
	}
	root.render(<App onSignOut={() => { void signOut(auth); }} />);
});
