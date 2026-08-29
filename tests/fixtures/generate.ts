// Genera 100 transacciones fake para Phase 2 (manual + fake data)
// Uso: npx tsx tests/fixtures/generate.ts > seed.json
const cats = ["alimentacion","transporte","restaurantes","suscripciones","servicios"];
for (let i=0;i<20;i++) {
  const amount = Math.floor(Math.random()*50000)+5000;
  console.log(JSON.stringify({ merchant: ["Lider","Jumbo","Uber","Spotify","Netflix"][i%5], amount, currency:"CLP", type:"expense", category: cats[i%5], date: new Date().toISOString() }));
}
