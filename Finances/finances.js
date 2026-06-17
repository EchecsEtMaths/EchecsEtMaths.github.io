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

async function getTransactions() {
  document.getElementById("content-finances").innerHTML = "";

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data, error } = await supabase
    .from("Transactions")
    .select("*")
    .eq("user", session.user.id)
    .order("date_transac", { ascending: false });

  data.forEach((transac) => {
    document.getElementById("content-finances").innerHTML +=
      "<tr>" +
      "<td>" +
      new Date(transac.date_transac).toLocaleDateString() +
      "</td>" +
      "<td>" +
      transac.description +
      "</td>" +
      "<td>" +
      transac.montant +
      "</td>" +
      "</tr>";
  });
}

getTransactions();
