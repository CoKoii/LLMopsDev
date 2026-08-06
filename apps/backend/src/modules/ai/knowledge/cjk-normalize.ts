// CJK 部首补充区（U+2E80–U+2EFF）→ 规范汉字。
// PDF 文本抽取常以部首字形回退（如 ⻚/⻅/⻋/⺠），统一为规范字形可提升文本检索命中。
// 映射依据 Unicode 字符名（CJK RADICAL ...），C-SIMPLIFIED/J-SIMPLIFIED 为简化部首。
const CJK_RADICAL_SUPPLEMENT_TO_CHAR: Record<string, string> = {
  "\u2E85": "人", // PERSON
  "\u2E88": "刀", // KNIFE ONE
  "\u2E89": "刀", // KNIFE TWO
  "\u2E8A": "卜", // DIVINATION
  "\u2E8B": "卩", // SEAL
  "\u2E8C": "小", // SMALL ONE
  "\u2E8D": "小", // SMALL TWO
  "\u2E8E": "尢", // LAME ONE
  "\u2E8F": "尢", // LAME TWO
  "\u2E90": "尢", // LAME THREE
  "\u2E91": "尢", // LAME FOUR
  "\u2E92": "巳", // SNAKE
  "\u2E96": "心", // HEART ONE
  "\u2E97": "心", // HEART TWO
  "\u2E98": "手", // HAND
  "\u2E9C": "日", // SUN
  "\u2E9D": "月", // MOON
  "\u2E9E": "歹", // DEATH
  "\u2E9F": "母", // MOTHER
  "\u2EA0": "民", // CIVILIAN
  "\u2EA1": "水", // WATER ONE
  "\u2EA2": "水", // WATER TWO
  "\u2EA3": "火", // FIRE
  "\u2EA4": "爪", // PAW ONE
  "\u2EA5": "爪", // PAW TWO
  "\u2EA7": "牛", // COW
  "\u2EA8": "犬", // DOG
  "\u2EA9": "王", // JADE
  "\u2EAA": "糸", // BOLT OF CLOTH
  "\u2EAB": "目", // EYE
  "\u2EAC": "礻", // SPIRIT ONE
  "\u2EAE": "竹", // BAMBOO
  "\u2EAF": "糸", // SILK
  "\u2EB0": "糸", // C-SIMPLIFIED SILK
  "\u2EB1": "罒", // NET ONE
  "\u2EB2": "罒", // NET TWO
  "\u2EB3": "罒", // NET THREE
  "\u2EB4": "罒", // NET FOUR
  "\u2EB5": "网", // MESH
  "\u2EB6": "羊", // SHEEP
  "\u2EB7": "羊", // RAM
  "\u2EB8": "羊", // EWE
  "\u2EB9": "老", // OLD
  "\u2EBA": "聿", // BRUSH ONE
  "\u2EBB": "聿", // BRUSH TWO
  "\u2EBC": "月", // MEAT
  "\u2EBD": "臼", // MORTAR
  "\u2EBE": "艹", // GRASS ONE
  "\u2EBF": "艹", // GRASS TWO
  "\u2EC0": "艹", // GRASS THREE
  "\u2EC1": "虎", // TIGER
  "\u2EC2": "衤", // CLOTHES
  "\u2EC3": "西", // WEST ONE
  "\u2EC4": "西", // WEST TWO
  "\u2EC5": "见", // C-SIMPLIFIED SEE
  "\u2EC6": "角", // SIMPLIFIED HORN
  "\u2EC7": "角", // HORN
  "\u2EC8": "讠", // C-SIMPLIFIED SPEECH
  "\u2EC9": "贝", // C-SIMPLIFIED SHELL
  "\u2ECA": "足", // FOOT
  "\u2ECB": "车", // C-SIMPLIFIED CART
  "\u2ECC": "辶", // SIMPLIFIED WALK
  "\u2ECD": "辶", // WALK ONE
  "\u2ECE": "辶", // WALK TWO
  "\u2ECF": "阝", // CITY
  "\u2ED0": "钅", // C-SIMPLIFIED GOLD
  "\u2ED1": "长", // LONG ONE
  "\u2ED2": "长", // LONG TWO
  "\u2ED3": "长", // C-SIMPLIFIED LONG
  "\u2ED4": "门", // C-SIMPLIFIED GATE
  "\u2ED5": "阝", // MOUND ONE
  "\u2ED6": "阝", // MOUND TWO
  "\u2ED7": "雨", // RAIN
  "\u2ED8": "青", // BLUE
  "\u2ED9": "韦", // C-SIMPLIFIED TANNED LEATHER
  "\u2EDA": "页", // C-SIMPLIFIED LEAF
  "\u2EDB": "风", // C-SIMPLIFIED WIND
  "\u2EDC": "飞", // C-SIMPLIFIED FLY
  "\u2EDD": "食", // EAT ONE
  "\u2EDE": "食", // EAT TWO
  "\u2EDF": "食", // EAT THREE
  "\u2EE0": "饣", // C-SIMPLIFIED EAT
  "\u2EE2": "马", // C-SIMPLIFIED HORSE
  "\u2EE3": "骨", // BONE
  "\u2EE4": "鬼", // GHOST
  "\u2EE5": "鱼", // C-SIMPLIFIED FISH
  "\u2EE6": "鸟", // C-SIMPLIFIED BIRD
  "\u2EE7": "卤", // C-SIMPLIFIED SALT
  "\u2EE8": "麦", // SIMPLIFIED WHEAT
  "\u2EE9": "黄", // SIMPLIFIED YELLOW
  "\u2EEA": "黾", // C-SIMPLIFIED FROG
  "\u2EEB": "齐", // J-SIMPLIFIED EVEN
  "\u2EEC": "齐", // C-SIMPLIFIED EVEN
  "\u2EED": "齿", // J-SIMPLIFIED TOOTH
  "\u2EEE": "齿", // C-SIMPLIFIED TOOTH
  "\u2EEF": "龙", // J-SIMPLIFIED DRAGON
  "\u2EF0": "龙", // C-SIMPLIFIED DRAGON
  "\u2EF1": "龟", // TURTLE
  "\u2EF2": "龟", // J-SIMPLIFIED TURTLE
  "\u2EF3": "龟", // C-SIMPLIFIED TURTLE
};

export const normalizeCjkText = (value: string) =>
  value
    .normalize("NFKC")
    .replace(
      /[\u2E80-\u2EFF]/g,
      (char) => CJK_RADICAL_SUPPLEMENT_TO_CHAR[char] ?? char,
    );
