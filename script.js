const TREES = {
  'A': { batchYears: ['25-26', '22-23', '19-20', '16-17'] },
  'B': { batchYears: ['24-25', '21-22', '18-19'] },
  'C': { batchYears: ['23-24', '20-21', '17-18'] },
};

let data = null;

const COLORS = {};

const state = {
  selectedId: null,
  selectedTree: null,
};

async function init() {
  const s = getComputedStyle(document.documentElement);
  COLORS.ancestor = s.getPropertyValue('--color-ancestor').trim();
  COLORS.mentee = s.getPropertyValue('--color-mentee').trim();

  const resp = await fetch('data.json');
  data = await resp.json();
  buildJaserToTreeMap();
  renderList();
  attachEvents();
}

function buildJaserToTreeMap() {
  const map = {};
  for (const [key, tree] of Object.entries(TREES)) {
    for (const year of tree.batchYears) {
      const jasers = data.jasers.filter(j => j.batchYear === year);
      for (const j of jasers) {
        map[j.id] = key;
      }
    }
  }
  data.jasers.forEach(j => { j.tree = map[j.id] || null; });
}

function splitName(name) {
  const idx = name.search(/[\u4e00-\u9fff]/);
  if (idx < 0) return { english: name, chinese: '' };
  if (idx === 0) return { english: '', chinese: name };
  return { english: name.slice(0, idx).trim(), chinese: name.slice(idx).trim() };
}

function formatBatchYear(short) {
  const [s, e] = short.split('-');
  return `20${s}-20${e} JASERs`;
}

function sortedBatchYears() {
  const years = Array.from(new Set(data.jasers.map(j => j.batchYear)));
  years.sort((a, b) => parseInt(b.split('-')[0]) - parseInt(a.split('-')[0]));
  return years;
}

function renderList() {
  const panel = document.querySelector('.tree-panel');
  if (!panel) return;

  panel.innerHTML = '';

  const years = sortedBatchYears();

  for (const year of years) {
    const section = document.createElement('section');
    section.className = 'batch-group';
    section.dataset.year = year;

    const header = document.createElement('h2');
    header.className = 'batch-header';
    header.textContent = formatBatchYear(year);

    const grid = document.createElement('div');
    grid.className = 'names-grid';

    const jasersInYear = data.jasers
      .filter(j => j.batchYear === year)
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const jaser of jasersInYear) {
      const card = document.createElement('div');
      card.className = 'jaser-card';
      card.dataset.id = jaser.id;
      card.dataset.tree = jaser.tree || '';

      const { english, chinese } = splitName(jaser.name);
      const engSpan = document.createElement('span');
      engSpan.className = 'eng-name';
      engSpan.textContent = english;
      card.appendChild(engSpan);

      if (chinese) {
        const chiSpan = document.createElement('span');
        chiSpan.className = 'chi-name';
        chiSpan.textContent = chinese;
        card.appendChild(chiSpan);
      }

      grid.appendChild(card);
    }

    section.appendChild(header);
    section.appendChild(grid);
    panel.appendChild(section);
  }
}

function attachEvents() {
  document.getElementById('tree-container').addEventListener('click', (e) => {
    const card = e.target.closest('.jaser-card');
    if (!card) return;
    selectJaser(parseInt(card.dataset.id));
  });

  document.addEventListener('click', (e) => {
    if (
      !e.target.closest('.jaser-card') &&
      !e.target.closest('#legend')
    ) {
      clearSelection();
    }
  });

  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (state.selectedId !== null) {
        const jaser = data.jasers.find(j => j.id === state.selectedId);
        if (jaser) {
          const ancestors = getAncestors(jaser);
          const descendants = getAllDescendants(jaser);
          drawLines(state.selectedId, ancestors, descendants);
        }
      }
    }, 150);
  });
}

function selectJaser(id) {
  if (state.selectedId === id) {
    clearSelection();
    return;
  }

  const jaser = data.jasers.find(j => j.id === id);
  if (!jaser) return;

  state.selectedId = id;
  state.selectedTree = jaser.tree;

  const ancestors = getAncestors(jaser);
  const descendants = getAllDescendants(jaser);

  applySelectionVisibility();
  updateHighlights(id, ancestors, descendants);
  drawLines(id, ancestors, descendants);
}

function clearSelection() {
  state.selectedId = null;
  state.selectedTree = null;

  document.querySelectorAll('.jaser-card').forEach(card => {
    card.classList.remove('clicked', 'ancestor', 'mentee', 'dimmed', 'hidden');
  });

  document.querySelectorAll('.batch-group').forEach(group => {
    group.classList.remove('hidden');
  });

  clearSvg();
}

function clearSvg() {
  document.querySelectorAll('.lines-svg').forEach(svg => {
    svg.innerHTML = '';
  });
}

function applySelectionVisibility() {
  const selectedTree = state.selectedTree;
  const jaser = data.jasers.find(j => j.id === state.selectedId);
  if (!jaser) return;

  const ancestors = getAncestors(jaser);
  const descendants = getAllDescendants(jaser);
  const keepIds = new Set([jaser.id, ...ancestors.map(a => a.id), ...descendants.map(d => d.id)]);

  document.querySelectorAll('.jaser-card').forEach(card => {
    const id = parseInt(card.dataset.id);
    const cardTree = card.dataset.tree;
    const inSelectedTree = cardTree === selectedTree;
    const isChain = keepIds.has(id);
    const visible = inSelectedTree || isChain;
    card.classList.toggle('hidden', !visible);
  });

  document.querySelectorAll('.batch-group').forEach(group => {
    const visibleCards = group.querySelectorAll('.jaser-card:not(.hidden)');
    group.classList.toggle('hidden', visibleCards.length === 0);
  });
}

function getAncestors(jaser) {
  const ancestors = [];
  let current = jaser;
  while (current.mentorId !== null) {
    const mentor = data.jasers.find(j => j.id === current.mentorId);
    if (mentor) {
      ancestors.push(mentor);
      current = mentor;
    } else {
      break;
    }
  }
  return ancestors;
}

function getAllDescendants(jaser) {
  const result = [];
  const queue = [jaser];
  const seen = new Set([jaser.id]);
  while (queue.length) {
    const current = queue.shift();
    const children = data.jasers.filter(j => j.mentorId === current.id);
    for (const child of children) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      result.push(child);
      queue.push(child);
    }
  }
  return result;
}

function updateHighlights(clickedId, ancestors, descendants) {
  const ancestorIds = new Set(ancestors.map(a => a.id));
  const descendantIds = new Set(descendants.map(m => m.id));

  document.querySelectorAll('.jaser-card').forEach(card => {
    card.classList.remove('clicked', 'ancestor', 'mentee', 'dimmed');
  });

  document.querySelectorAll('.jaser-card:not(.hidden)').forEach(card => {
    const id = parseInt(card.dataset.id);
    if (id === clickedId) {
      card.classList.add('clicked');
    } else if (ancestorIds.has(id)) {
      card.classList.add('ancestor');
    } else if (descendantIds.has(id)) {
      card.classList.add('mentee');
    } else {
      card.classList.add('dimmed');
    }
  });
}

function drawLines(clickedId, ancestors, descendants) {
  const panel = document.querySelector('.tree-panel');
  if (!panel) return;

  let svg = panel.querySelector('.lines-svg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('lines-svg');
    panel.appendChild(svg);
  }

  svg.innerHTML = '';

  const width = panel.scrollWidth;
  const height = panel.scrollHeight;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.width = width + 'px';
  svg.style.height = height + 'px';

  const panelRect = panel.getBoundingClientRect();

  function getCardCenter(id) {
    const card = panel.querySelector(`.jaser-card[data-id="${id}"]`);
    if (!card || card.classList.contains('hidden')) return null;
    const rect = card.getBoundingClientRect();
    return {
      top: rect.top - panelRect.top,
      bottom: rect.bottom - panelRect.top,
      centerX: rect.left - panelRect.left + rect.width / 2,
    };
  }

  function makeLine(x1, y1, x2, y2, color) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('opacity', '0.7');
    return line;
  }

  const chainOrder = [...ancestors].reverse();
  const clicked = data.jasers.find(j => j.id === clickedId);
  if (clicked) {
    chainOrder.push(clicked);
  }

  for (let i = 0; i < chainOrder.length - 1; i++) {
    const lower = chainOrder[i];
    const upper = chainOrder[i + 1];
    const lowerPos = getCardCenter(lower.id);
    const upperPos = getCardCenter(upper.id);
    if (!lowerPos || !upperPos) continue;

    const line = makeLine(
      lowerPos.centerX, lowerPos.top,
      upperPos.centerX, upperPos.bottom,
      COLORS.ancestor
    );
    svg.appendChild(line);
  }

  const subtreeQueue = clicked ? [clicked] : [];
  const subtreeSeen = new Set();
  while (subtreeQueue.length) {
    const parent = subtreeQueue.shift();
    if (subtreeSeen.has(parent.id)) continue;
    subtreeSeen.add(parent.id);
    const parentPos = getCardCenter(parent.id);
    if (!parentPos) continue;
    const children = data.jasers.filter(j => j.mentorId === parent.id);
    for (const child of children) {
      const childPos = getCardCenter(child.id);
      if (!childPos) continue;
      const line = makeLine(
        parentPos.centerX, parentPos.top,
        childPos.centerX, childPos.bottom,
        COLORS.mentee
      );
      svg.appendChild(line);
      subtreeQueue.push(child);
    }
  }
}

init();