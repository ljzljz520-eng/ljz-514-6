/* ============================================================
 * 页面交互与渲染
 *  - 左侧：所在缆车 / 水平等级 / 想去雪道 / 想去休息站
 *  - 右侧：汇总指标、SVG 雪场示意图（路线段按风险着色）、分段风险列表
 * ============================================================ */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };

  var state = {
    lift: 'L1',
    skill: 1,                       // 0初级 1中级 2高级 3专家
    trails: new Set(['T3']),
    rests: new Set(['R2']),
  };

  var nodeById = {};
  RESORT.nodes.forEach(function (n) { nodeById[n.id] = n; });
  function nodeName(id) { return nodeById[id] ? nodeById[id].name : id; }

  var RISK_COLORS = ['#2ecc71', '#f39c12', '#e74c3c'];

  /* ---------------- 控件 ---------------- */
  function renderControls() {
    var liftSel = $('#lift-select');
    liftSel.innerHTML = RESORT.lifts.map(function (l) {
      return '<option value="' + l.id + '"' + (l.open ? '' : ' disabled') + '>' +
             l.name + (l.open ? '' : '（今日关闭）') + '</option>';
    }).join('');
    liftSel.value = state.lift;
    liftSel.addEventListener('change', function () { state.lift = liftSel.value; update(); });

    var skillDesc = ['绿道自如', '蓝道自如', '红道自如', '黑道自如'];
    var sg = $('#skill-group');
    sg.innerHTML = Planner.SKILL_NAMES.map(function (n, i) {
      return '<label class="skill-card' + (i === state.skill ? ' on' : '') + '">' +
        '<input type="radio" name="skill" value="' + i + '"' + (i === state.skill ? ' checked' : '') + '>' +
        '<b>' + n + '</b><small>' + skillDesc[i] + '</small></label>';
    }).join('');
    sg.querySelectorAll('input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        state.skill = +inp.value;
        sg.querySelectorAll('.skill-card').forEach(function (c, i) {
          c.classList.toggle('on', i === state.skill);
        });
        update();
      });
    });

    var tl = $('#trail-list');
    tl.innerHTML = RESORT.trails.filter(function (t) { return t.id !== 'T11b'; }).map(function (t) {
      return '<label class="item' + (t.open ? '' : ' off') + '">' +
        '<input type="checkbox" value="' + t.id + '"' + (t.open ? '' : ' disabled') +
          (state.trails.has(t.id) ? ' checked' : '') + '>' +
        '<span class="dot" style="background:' + Planner.DIFF_COLORS[t.difficulty] + '"></span>' +
        '<span class="item-name">' + t.name + '</span>' +
        '<small>' + Planner.DIFF_NAMES[t.difficulty] + ' · ' + (t.length / 1000).toFixed(1) +
          'km · 拥挤' + Planner.CROWD_NAMES[t.crowding] + '</small>' +
        (t.open ? '' : '<em class="closed-tag">关闭 · ' + (t.note || '暂停') + '</em>') +
        '</label>';
    }).join('');
    tl.querySelectorAll('input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        if (inp.checked) state.trails.add(inp.value); else state.trails.delete(inp.value);
        update();
      });
    });

    var rl = $('#rest-list');
    rl.innerHTML = RESORT.rests.map(function (r) {
      return '<label class="item">' +
        '<input type="checkbox" value="' + r.id + '"' + (state.rests.has(r.id) ? ' checked' : '') + '>' +
        '<span class="rest-ic">☕</span>' +
        '<span class="item-name">' + r.name + '</span>' +
        '<small>位于 ' + nodeName(r.node) + '</small></label>';
    }).join('');
    rl.querySelectorAll('input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        if (inp.checked) state.rests.add(inp.value); else state.rests.delete(inp.value);
        update();
      });
    });

    $('#plan-btn').addEventListener('click', update);
  }

  /* ---------------- 地图几何 ---------------- */
  function edgeGeometry(a, b, off) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.hypot(dx, dy) || 1;
    var shrink = 11;
    var ax = a.x + dx / len * shrink, ay = a.y + dy / len * shrink;
    var bx = b.x - dx / len * shrink, by = b.y - dy / len * shrink;
    var nx = -dy / len, ny = dx / len;
    var cx = (a.x + b.x) / 2 + nx * off, cy = (a.y + b.y) / 2 + ny * off;
    return {
      d: 'M ' + ax.toFixed(1) + ' ' + ay.toFixed(1) +
         ' Q ' + cx.toFixed(1) + ' ' + cy.toFixed(1) +
         ' ' + bx.toFixed(1) + ' ' + by.toFixed(1),
      a: { x: ax, y: ay }, c: { x: cx, y: cy }, b: { x: bx, y: by },
    };
  }

  function quadPoint(g, t) {
    var u = 1 - t;
    return {
      x: u * u * g.a.x + 2 * u * t * g.c.x + t * t * g.b.x,
      y: u * u * g.a.y + 2 * u * t * g.c.y + t * t * g.b.y,
    };
  }

  /* ---------------- SVG 雪场图 ---------------- */
  function renderMap(res) {
    var allEdges = RESORT.lifts.map(function (l) { return Object.assign({ kind: 'lift' }, l); })
      .concat(RESORT.trails.map(function (t) { return Object.assign({ kind: 'trail' }, t); }));

    // 同一对节点之间的平行边自动错开
    var groups = {};
    allEdges.forEach(function (e) {
      var key = [e.from, e.to].sort().join('|');
      (groups[key] = groups[key] || []).push(e);
    });
    var geo = {};
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      g.forEach(function (e, i) {
        geo[e.id] = edgeGeometry(nodeById[e.from], nodeById[e.to], (i - (g.length - 1) / 2) * 16);
      });
    });

    var markers =
      '<marker id="arr-lift" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">' +
        '<path d="M0,0L10,5L0,10z" fill="#8e44ad"/></marker>' +
      [0, 1, 2, 3].map(function (i) {
        return '<marker id="arr-d' + i + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">' +
          '<path d="M0,0L10,5L0,10z" fill="' + Planner.DIFF_COLORS[i] + '"/></marker>';
      }).join('');

    var edgeEls = allEdges.map(function (e) {
      var g = geo[e.id];
      if (!e.open) {
        var p = quadPoint(g, 0.5);
        return '<path class="edge closed" d="' + g.d + '"><title>' + e.name +
               '（关闭：' + (e.note || '暂停') + '）</title></path>' +
               '<text class="closed-label" x="' + p.x.toFixed(1) + '" y="' + (p.y - 5).toFixed(1) + '">✕ 关闭</text>';
      }
      var cls = e.kind === 'lift' ? 'edge-lift' : 'edge-trail d' + e.difficulty;
      var mk = e.kind === 'lift' ? 'url(#arr-lift)' : 'url(#arr-d' + e.difficulty + ')';
      return '<path class="edge ' + cls + '" d="' + g.d + '" marker-end="' + mk + '">' +
             '<title>' + e.name + '</title></path>';
    }).join('');

    // 推荐路线：白色描边 + 风险色主线 + 序号
    var usage = {}, routeEls = '';
    res.legs.forEach(function (leg) {
      leg.segments.forEach(function (s) {
        var g = geo[s.id];
        if (!g) return;
        usage[s.id] = (usage[s.id] || 0) + 1;
        var p = quadPoint(g, Math.min(0.5 + (usage[s.id] - 1) * 0.2, 0.85));
        var color = RISK_COLORS[s._risk.level];
        routeEls +=
          '<path class="route-casing" d="' + g.d + '"/>' +
          '<path class="route-line" style="stroke:' + color + '" d="' + g.d + '">' +
            '<title>第' + s._seq + '段 · ' + s.name + ' · ' + s._risk.label + '</title></path>' +
          '<g class="seq"><circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="9"/>' +
          '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + 3.5).toFixed(1) + '">' + s._seq + '</text></g>';
      });
    });

    var lift = RESORT.lifts.find(function (l) { return l.id === state.lift; });
    var startNode = lift ? lift.from : null;

    var nodeEls = RESORT.nodes.map(function (n) {
      return '<g class="node">' +
        (n.id === startNode ? '<circle class="pulse" cx="' + n.x + '" cy="' + n.y + '" r="10"/>' : '') +
        '<circle class="core" cx="' + n.x + '" cy="' + n.y + '" r="6.5"/>' +
        '<text class="node-label" x="' + n.x + '" y="' + (n.y + 22) + '">' + n.name + '</text>' +
        (n.id === startNode ? '<text class="start-label" x="' + n.x + '" y="' + (n.y - 16) + '">起点</text>' : '') +
        '</g>';
    }).join('');

    var restEls = RESORT.rests.map(function (r) {
      var n = nodeById[r.node];
      var sel = state.rests.has(r.id);
      return '<g class="rest' + (sel ? ' sel' : '') + '">' +
        '<circle cx="' + (n.x + 18) + '" cy="' + (n.y - 14) + '" r="9"><title>' + r.name + '</title></circle>' +
        '<text class="rest-ic" x="' + (n.x + 18) + '" y="' + (n.y - 10) + '">☕</text></g>';
    }).join('');

    $('#map').innerHTML =
      '<svg viewBox="0 0 820 600" role="img" aria-label="雪场示意图">' +
      '<defs>' + markers +
        '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#e8f2fc"/><stop offset="1" stop-color="#fbfdff"/>' +
        '</linearGradient></defs>' +
      '<rect width="820" height="600" fill="url(#bg)" rx="12"/>' +
      '<polygon points="0,600 220,180 460,600" fill="#ffffff" opacity="0.55"/>' +
      '<polygon points="300,600 560,120 820,600" fill="#ffffff" opacity="0.45"/>' +
      '<g>' + edgeEls + '</g>' +
      '<g>' + routeEls + '</g>' +
      '<g>' + nodeEls + '</g>' +
      '<g>' + restEls + '</g>' +
      '</svg>';
  }

  /* ---------------- 提示条 / 汇总 / 分段列表 ---------------- */
  function renderBanner(res) {
    var html = '';
    if (res.error) {
      html += '<div class="banner error">⛔ ' + res.error + '</div>';
    } else {
      if (res.unreachable.length) {
        html += '<div class="banner warn">⚠️ 部分目标无法纳入路线：<ul>' +
          res.unreachable.map(function (u) { return '<li><b>' + u.name + '</b>：' + u.reason + '</li>'; }).join('') +
          '</ul></div>';
      }
      if (res.totals && res.totals.maxRisk === 2) {
        html += '<div class="banner danger">⚠️ 推荐路线包含<b>高风险路段</b>（难度超出当前水平），' +
                '请谨慎评估，或调整目标 / 提高等级选择。</div>';
      }
    }
    $('#banner').innerHTML = html;
  }

  function renderSummary(res) {
    var el = $('#summary');
    if (res.error || !res.totals) { el.innerHTML = ''; return; }
    var t = res.totals;
    var h = Math.floor(t.timeMin / 60), m = t.timeMin % 60;
    var timeStr = h ? h + '<small>小时</small>' + m + '<small>分</small>' : m + '<small>分钟</small>';
    el.innerHTML =
      stat((t.trailLen / 1000).toFixed(1) + '<small>km</small>', '滑行总长') +
      stat(timeStr, '预计用时') +
      stat(t.liftCount + '<small>次</small>', '缆车乘坐') +
      stat(t.doneGoals + '/' + t.totalGoals, '目标达成') +
      stat('<span class="risk-text r' + t.maxRisk + '">' + Planner.RISK_NAMES[t.maxRisk] + '</span>', '整体风险');

    function stat(num, label) {
      return '<div class="stat"><div class="stat-num">' + num + '</div>' +
             '<div class="stat-label">' + label + '</div></div>';
    }
  }

  function renderLegs(res) {
    var el = $('#route');
    if (res.error) { el.innerHTML = '<div class="empty">无法规划路线，请调整左侧选择。</div>'; return; }
    if (!res.legs.length) { el.innerHTML = '<div class="empty">请选择想去的目标。</div>'; return; }

    var goalIcon = { start: '🚡', trail: '⛷️', rest: '☕', return: '🏁' };
    var html = '';
    res.legs.forEach(function (leg) {
      html += '<div class="leg"><div class="leg-title">' + (goalIcon[leg.goal.type] || '•') + ' ' + leg.goal.name + '</div>';
      if (!leg.segments.length) {
        html += '<div class="seg-note">已在此处，无需移动 ✔</div>';
      }
      leg.segments.forEach(function (s) {
        var r = s._risk;
        var isLift = s.kind === 'lift';
        var diffBadge = isLift ? '' :
          '<span class="badge" style="background:' + Planner.DIFF_COLORS[s.difficulty] + '">' +
          Planner.DIFF_NAMES[s.difficulty] + '</span>';
        var meta = isLift
          ? '乘坐约 ' + s.rideMinutes + ' 分钟 · 拥挤度 ' + Planner.CROWD_NAMES[s.crowding]
          : (s.length / 1000).toFixed(1) + ' km · 拥挤度 ' + Planner.CROWD_NAMES[s.crowding];
        html +=
          '<div class="seg risk-' + r.level + '">' +
            '<div class="seg-seq">' + s._seq + '</div>' +
            '<div class="seg-body">' +
              '<div class="seg-head">' +
                '<span class="seg-icon">' + (isLift ? '🚡' : '⛷️') + '</span>' +
                '<span class="seg-name">' + s.name + '</span>' + diffBadge +
                '<span class="risk-badge rb-' + r.level + '">' + r.label + '</span>' +
              '</div>' +
              '<div class="seg-meta">' + nodeName(s.from) + ' → ' + nodeName(s.to) + ' · ' + meta + '</div>' +
              '<div class="seg-reasons">' +
                r.reasons.map(function (x) { return '<span class="reason">' + x + '</span>'; }).join('') +
              '</div>' +
            '</div>' +
          '</div>';
      });
      html += '</div>';
    });
    el.innerHTML = html;
  }

  /* ---------------- 主流程 ---------------- */
  function update() {
    var res = Planner.planRoute(RESORT, {
      startLiftId: state.lift,
      skill: state.skill,
      trailIds: Array.from(state.trails),
      restIds: Array.from(state.rests),
    });
    var seq = 0;
    res.legs.forEach(function (leg) {
      leg.segments.forEach(function (s) {
        s._seq = ++seq;
        s._risk = Planner.segmentRisk(s, state.skill);
      });
    });
    renderBanner(res);
    renderSummary(res);
    renderMap(res);
    renderLegs(res);
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderControls();
    update();
  });
})();
