(function (root) {
  "use strict";
  const shuffle = (values) => {
    const out = [...values];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  function randomAnswer(question) {
    const ids = (question.options || []).map((x) => x.id);
    switch (question.type) {
      case "SINGLE_CHOICE": return { selected: [ids[Math.floor(Math.random() * ids.length)]] };
      case "MULTIPLE_SELECT": {
        const mixed = shuffle(ids);
        return { selected: mixed.slice(0, 1 + Math.floor(Math.random() * mixed.length)) };
      }
      case "WORD_ANSWER": case "LONG_ANSWER": return { text: "Random test response" };
      case "NUMERIC": return { value: Math.floor(Math.random() * 101) };
      case "FORMULA": return { expression: "TEST_EXPRESSION(m,v)" };
      case "SORTING": return { order: shuffle((question.items || []).map((x) => x.id)) };
      case "MATCHING": {
        const right = shuffle((question.right || []).map((x) => x.id));
        return { pairs: (question.left || []).map((x, i) => [x.id, right[i]]) };
      }
      default: throw Object.assign(new Error(`No random provider for ${question.type}`), { category: "UNSUPPORTED_TYPE" });
    }
  }
  root.THAA = root.THAA || {};
  Object.assign(root.THAA, { shuffle, randomAnswer });
})(globalThis);
