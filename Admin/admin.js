import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteUserById(userId) {
  if (confirm("Vous voulez supprimer ce user ?") == true) {
    await supabase.from("User").delete().eq("id", userId);
  }
  await getUsers();
}

async function createUser() {
  document.getElementById("loading").style.display = "block";

  document.getElementById("users").innerHTML = "";

  await supabase.from("User").insert({
    nom: document.getElementById("inputNom").value,
    prenom: document.getElementById("inputPrenom").value,
    role: document.getElementById("inputRole").value,
  });

  document.getElementById("loading").style.display = "none";
}

async function getUsers() {
  document.getElementById("loading").style.display = "block";

  document.getElementById("users").innerHTML = "";

  const { data, error } = await supabase.from("User").select("*");

  data.forEach((user) => {
    document.getElementById("users").innerHTML +=
      "<li>" +
      user.prenom +
      " " +
      user.nom +
      " - " +
      user.role +
      " <span class='delete-user' id='" +
      user.id +
      "''>❌</span></li>";
    document.getElementById(user.id).onclick = async () => {
      await deleteUserById(user.id);
    };
  });

  document.getElementById("loading").style.display = "none";
}

document.getElementById("load").onclick = async () => {
  await getUsers();
};

document.getElementById("create").onclick = async () => {
  await createUser();
  await getUsers();
};

getUsers();
