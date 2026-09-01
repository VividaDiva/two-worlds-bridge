// Each role is shown TWO crossings, not told a word about them. What the two
// have in common is what that role means by "a crossing" — and that intersection
// is ground truth we can score the built crossing against. Nobody is told it.
const S = (level,hand,middle,width,bracing,surface,ends,cover) =>
  ({level,hand,middle,width,bracing,surface,ends,cover});

export const REF_PAIRS = {
  A: [
    { key:"A1", pair:[S("raised","rail","none","one","none","bare","rested","open"),
                      S("raised","rail","tower","two","struts","rough","footed","open")] },
    { key:"A2", pair:[S("raised","none","post","one","none","bare","footed","open"),
                      S("raised","rail","none","two","struts","rough","footed","open")] },
    { key:"A3", pair:[S("at","rail","none","one","none","rough","rested","open"),
                      S("at","rail","post","two","struts","rough","footed","roof")] },
    { key:"A4", pair:[S("at","none","none","two","struts","bare","rested","open"),
                      S("raised","rail","tower","two","struts","rough","footed","open")] },
  ],
  B: [
    { key:"B1", pair:[S("at","none","post","one","none","rough","rested","roof"),
                      S("at","none","none","two","struts","rough","footed","roof")] },
    { key:"B2", pair:[S("at","none","none","one","none","bare","rested","open"),
                      S("at","rail","post","one","none","bare","footed","open")] },
    { key:"B3", pair:[S("raised","none","tower","one","none","bare","footed","open"),
                      S("at","rail","tower","two","struts","rough","footed","roof")] },
    { key:"B4", pair:[S("at","rail","none","one","none","bare","rested","roof"),
                      S("raised","rail","post","two","struts","rough","footed","roof")] },
  ],
};

// What the two pictures agree on. This is the role's actual referent.
export const sharedOf = ([a,b]) =>
  Object.fromEntries(Object.keys(a).filter(k => a[k] === b[k]).map(k => [k, a[k]]));

export const ALL_SHAPES = [...REF_PAIRS.A, ...REF_PAIRS.B].flatMap(p =>
  p.pair.map((s,i) => ({ id: `${p.key}${i===0?"a":"b"}`, shape: s })));
