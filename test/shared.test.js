const test = require("node:test");
const assert = require("node:assert/strict");
const shared = require("../src/shared.js");

test("normalizeTitle removes punctuation, accents, and marks", () => {
  assert.equal(
    shared.normalizeTitle("The Evil Within® 2"),
    "evil within 2"
  );

  assert.equal(
    shared.normalizeTitle("Clair Obscur: Expedition 33"),
    "clair obscur expedition 33"
  );
});

test("createSearchQueries keeps useful title variants", () => {
  const queries = shared.createSearchQueries("Dishonored: Definitive Edition");

  assert.deepEqual(queries, [
    "Dishonored: Definitive Edition",
    "dishonored"
  ]);
});

test("scoreCandidate strongly prefers close matches", () => {
  const exactScore = shared.scoreCandidate("Disco Elysium", "Disco Elysium");
  const weakScore = shared.scoreCandidate("Disco Elysium", "Borderlands 3");

  assert.ok(exactScore > weakScore);
  assert.ok(exactScore >= 950);
});

test("extractScoreFromText returns the last valid metascore-like number", () => {
  assert.equal(
    shared.extractScoreFromText("Dishonored: Definitive Edition game Aug 25, 2015 PlayStation 4, and more 80"),
    80
  );

  assert.equal(
    shared.extractScoreFromText("Metascore 92 out of 100"),
    92
  );

  assert.equal(
    shared.extractScoreFromText("Metascore TBD"),
    null
  );

  assert.equal(
    shared.extractScoreFromText("Metascore null out of 100"),
    null
  );

  assert.equal(
    shared.extractScoreFromText("0"),
    null
  );

  assert.equal(shared.extractScoreFromText("No score available"), null);
});
