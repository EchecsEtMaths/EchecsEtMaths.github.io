import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(supabaseUrl, supabaseKey);

document.getElementById("signup").addEventListener("click", signup);

async function signup() {
  const email = document.getElementById("signup-email").value;

  const password = document.getElementById("signup-password").value;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    alert(error.message);
    return;
  }
  const { data2, error2 } = await supabase.from("User").insert({
    id: data.user.id,
    nom: document.getElementById("signup-nom").value,
    prenom: document.getElementById("signup-prenom").value,
    role: "USER",
  });

  if (error2) {
    alert(error2.message);
    return;
  }

  document.getElementById("login-email").value =
    document.getElementById("signup-email").value;
  document.getElementById("login-password").value =
    document.getElementById("signup-password").value;
  await login();
}

document.getElementById("login").addEventListener("click", login);

async function login() {
  const email = document.getElementById("login-email").value;

  const password = document.getElementById("login-password").value;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    alert(error.message);
    return;
  }

  window.location.replace("/");
}

async function updateStatus() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const status = document.getElementById("status");

  if (session) {
    window.location.replace("/");
  }
}

supabase.auth.onAuthStateChange((event, session) => {
  updateStatus();
});
