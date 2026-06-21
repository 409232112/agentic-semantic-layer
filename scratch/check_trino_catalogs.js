// Use standard global fetch since Node v18+ supports it natively

async function runTrinoQuery(sql, user = 'admin') {
  const trinoUrl = 'http://192.168.0.165:8080';
  const response = await fetch(`${trinoUrl}/v1/statement`, {
    method: 'POST',
    headers: {
      'X-Trino-User': user,
      'Content-Type': 'text/plain',
    },
    body: sql,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  let body = await response.json();
  let data = [];
  if (body.data) {
    data.push(...body.data);
  }

  while (body.nextUri) {
    const nextResponse = await fetch(body.nextUri, {
      headers: { 'X-Trino-User': user },
    });
    body = await nextResponse.json();
    if (body.data) {
      data.push(...body.data);
    }
    if (body.error) {
      throw new Error(JSON.stringify(body.error));
    }
  }

  return { data };
}

async function diagnose() {
  try {
    console.log("=== Trino URL === http://192.168.0.165:8080");
    
    console.log("\n1. Fetching mounted catalogs...");
    const catalogs = await runTrinoQuery('SHOW CATALOGS');
    console.log("Available Catalogs:", catalogs.data);

    console.log("\n2. Checking catalog schema for postgres...");
    try {
      const pgSchemas = await runTrinoQuery('SHOW SCHEMAS FROM postgres');
      console.log("postgres schemas:", pgSchemas.data);
    } catch (e) {
      console.error("Error query 'postgres' catalog:", e.message);
    }

    console.log("\n3. Checking catalog schema for postgresql...");
    try {
      const pgSqlSchemas = await runTrinoQuery('SHOW SCHEMAS FROM postgresql');
      console.log("postgresql schemas:", pgSqlSchemas.data);
    } catch (e) {
      console.error("Error query 'postgresql' catalog:", e.message);
    }

    console.log("\n4. Checking catalog schema for mysql...");
    try {
      const mysqlSchemas = await runTrinoQuery('SHOW SCHEMAS FROM mysql');
      console.log("mysql schemas:", mysqlSchemas.data);
    } catch (e) {
      console.error("Error query 'mysql' catalog:", e.message);
    }

  } catch (err) {
    console.error("Connection failed:", err.message);
  }
}

diagnose();
