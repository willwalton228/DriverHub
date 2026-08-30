async function main() {
  const username = process.env.WHENIWORK_USERNAME;
  const password = process.env.WHENIWORK_PASSWORD;
  
  console.log("Attempting WIW login (no app key — standard login)...");
  
  // Standard WIW login without application_key
  const res = await fetch("https://api.wheniwork.com/2/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  
  console.log("Login status:", res.status);
  const body = await res.json();
  
  if (res.ok) {
    const token = body.login?.token;
    console.log("SUCCESS! Session token:", token ? token.substring(0, 10) + "..." : "none");
    console.log("Account ID:", body.login?.account_id);
    console.log("User ID:", body.login?.user_id);
    
    if (token) {
      const usersRes = await fetch("https://api.wheniwork.com/2/users?limit=10", {
        headers: { "W-Token": token }
      });
      console.log("\nGET /users → status:", usersRes.status);
      const usersBody = await usersRes.json();
      if (usersRes.ok) {
        console.log("Users fetched:", usersBody.users?.length ?? 0);
        (usersBody.users || []).slice(0, 5).forEach((u: any) => {
          console.log(` - ${u.first_name} ${u.last_name} (id: ${u.id}, role: ${u.role})`);
        });
      } else {
        console.log("Error:", usersBody.error);
      }
    }
  } else {
    console.log("Login failed:", body.error, `(code ${body.code})`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
