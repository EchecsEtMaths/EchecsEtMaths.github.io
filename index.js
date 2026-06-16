import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateStatus() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.replace("/Auth/login.html");
  }

  const { data, error } = await supabase
    .from("User")
    .select("*")
    .eq("id", session.user.id);
  document.getElementById("salutations").innerHTML =
    "Bonjour " + data[0].prenom;

  if (data[0].role === "ADMIN") {
    document.getElementById("button-admin").style.display = "inline";
  }
}

supabase.auth.onAuthStateChange((event, session) => {
  updateStatus();
});

document.getElementById("logout").addEventListener("click", logout);

async function logout() {
  await supabase.auth.signOut();
}
