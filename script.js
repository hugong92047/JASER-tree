const TREES = {
  'A': { label: 'Tree A', batchYears: ['25-26', '22-23', '19-20', '16-17'] },
  'B': { label: 'Tree B', batchYears: ['24-25', '21-22', '18-19'] },
  'C': { label: 'Tree C', batchYears: ['23-24', '20-21', '17-18'] },
};

let data = null;

const state = {
  selectedId: null,
  activeTree: 'A',
  activeJasers: [],
};

async function init() {
  const resp = await fetch('data.json');
  data = await resp.json();
  renderTabs();
  filterByTree('A');
  renderTree();
  attachEvents();
}

function renderTabs() {
  const container = document.getElementById('tabs');
  container.innerHTML = '';
  for (const [key, tree] of Object.entries(TREES)) {
    const tab = document.createElement('button');
    tab.className = 'tab' + (key === state.activeTree ? ' active' : '');
    tab.dataset.tree = key;
    tab.textContent = tree.label;
    container.appendChild(tab);
  }
}

function filterByTree(key) {
  const tree = TREES[key];
  state.activeJasers = data.jasers.filter(j =>
    tree.batchYears.includes(j.batchYear)
  );
}

function switchTree(key) {
  if (state.activeTree === key) return;
  state.activeTree = key;
  clearSelection();
  filterByTree(key);
  renderTree();

  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tree === key)
  );
}

function renderTree() {
  const tree = document.getElementById('tree');
  const grouped = groupByBatch(state.activeJasers);

  tree.innerHTML = '';

  const sortedYears = Object.keys(grouped).sort((a, b) => {
    const yearA = parseInt(a.split('-')[0]);
    const yearB = parseInt(b.split('-')[0]);
    return yearB - yearA;
  });

  for (const year of sortedYears) {
    const section = document.createElement('section');
    section.className = 'batch-group';
    section.dataset.year = year;

    const header = document.createElement('h2');
    header.className = 'batch-header';
    header.textContent = year;

    const grid = document.createElement('div');
    grid.className = 'names-grid';

    const sortedJasers = [...grouped[year]].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    for (const jaser of sortedJasers) {
      const card = document.createElement('div');
      card.className = 'jaser-card';
      card.dataset.id = jaser.id;
      card.textContent = jaser.name;
      grid.appendChild(card);
    }

    section.appendChild(header);
    section.appendChild(grid);
    tree.appendChild(section);
  }
}

function groupByBatch(jasers) {
  const groups = {};
  for (const jaser of jasers) {
    if (!groups[jaser.batchYear]) {
      groups[jaser.batchYear] = [];
    }
    groups[jaser.batchYear].push(jaser);
  }
  return groups;
}

function attachEvents() {
  document.getElementById('tree').addEventListener('click', (e) => {
    const card = e.target.closest('.jaser-card');
    if (!card) return;
    const id = parseInt(card.dataset.id);
    selectJaser(id);
  });

  document.getElementById('tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    switchTree(tab.dataset.tree);
  });

  document.addEventListener('click', (e) => {
    if (
      !e.target.closest('.jaser-card') &&
      !e.target.closest('#legend') &&
      !e.target.closest('#tabs')
    ) {
      clearSelection();
    }
  });

  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (state.selectedId !== null) {
        const jaser = state.activeJasers.find(j => j.id === state.selectedId);
        if (jaser) {
          const ancestors = getAncestors(jaser);
          const mentees = getDirectMentees(jaser);
          drawLines(state.selectedId, ancestors, mentees);
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

  state.selectedId = id;

  const jaser = state.activeJasers.find(j => j.id === id);
  if (!jaser) return;

  const ancestors = getAncestors(jaser);
  const mentees = getDirectMentees(jaser);

  updateHighlights(id, ancestors, mentees);
  drawLines(id, ancestors, mentees);
}

function clearSelection() {
  state.selectedId = null;
  document.querySelectorAll('.jaser-card').forEach((card) => {
    card.classList.remove('clicked', 'ancestor', 'mentee', 'dimmed');
  });
  clearSvg();
}

function clearSvg() {
  const svg = document.getElementById('lines-svg');
  if (svg) {
    svg.innerHTML = '';
  }
}

function getAncestors(jaser) {
  const ancestors = [];
  let current = jaser;
  while (current.mentorId !== null) {
    const mentor = state.activeJasers.find(j => j.id === current.mentorId);
    if (mentor) {
      ancestors.push(mentor);
      current = mentor;
    } else {
      break;
    }
  }
  return ancestors;
}

function getDirectMentees(jaser) {
  return state.activeJasers.filter(j => j.mentorId === jaser.id);
}

function updateHighlights(clickedId, ancestors, mentees) {
  const ancestorIds = new Set(ancestors.map(a => a.id));
  const menteeIds = new Set(mentees.map(m => m.id));

  document.querySelectorAll('.jaser-card').forEach((card) => {
    const id = parseInt(card.dataset.id);
    card.classList.remove('clicked', 'ancestor', 'mentee', 'dimmed');

    if (id === clickedId) {
      card.classList.add('clicked');
    } else if (ancestorIds.has(id)) {
      card.classList.add('ancestor');
    } else if (menteeIds.has(id)) {
      card.classList.add('mentee');
    } else {
      card.classList.add('dimmed');
    }
  });
}

function drawLines(clickedId, ancestors, mentees) {
  const tree = document.getElementById('tree');
  let svg = document.getElementById('lines-svg');

  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'lines-svg';
    tree.insertBefore(svg, tree.firstChild);
  }

  svg.innerHTML = '';

  const width = tree.scrollWidth;
  const height = tree.scrollHeight;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.width = width + 'px';
  svg.style.height = height + 'px';

  const treeRect = tree.getBoundingClientRect();

  function getCardCenter(id) {
    const card = document.querySelector(`.jaser-card[data-id="${id}"]`);
    if (!card) return null;
    const rect = card.getBoundingClientRect();
    return {
      top: rect.top - treeRect.top,
      bottom: rect.bottom - treeRect.top,
      centerX: rect.left - treeRect.left + rect.width / 2,
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
  const clicked = state.activeJasers.find(j => j.id === clickedId);
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
      '#16a34a'
    );
    svg.appendChild(line);
  }

  const clickedPos = getCardCenter(clickedId);
  if (clickedPos) {
    for (const mentee of mentees) {
      const menteePos = getCardCenter(mentee.id);
      if (!menteePos) continue;

      const line = makeLine(
        clickedPos.centerX, clickedPos.top,
        menteePos.centerX, menteePos.bottom,
        '#d97706'
      );
      svg.appendChild(line);
    }
  }
}

init();
