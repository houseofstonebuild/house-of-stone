const $ = selector => document.querySelector(selector);
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
const labels = {page_view:'Website visits',explore_click:'Collection clicks',work_view:'Work views',inquiry_started:'Inquiries started',inquiry_submitted:'Inquiries submitted'};
const notifications = {inbox_only:'Saved in inbox',pending:'Notification queued',retrying:'Notification retrying',sent:'Notification accepted',failed:'Notification failed'};
async function load() {
  $('#refresh').disabled = true; $('#status').textContent = 'Loading the inbox…';
  try {
    const days = $('#period').value;
    const responses = await Promise.all([fetch('/api/admin/summary?days=' + days),fetch('/api/admin/inquiries')]);
    if (responses.some(r => !r.ok)) throw new Error('Could not load the private inbox. Please refresh and sign in again.');
    const [summary,inquiries] = await Promise.all(responses.map(r => r.json()));
    const count = name => summary.funnel.find(step => step.name === name)?.sessions || 0;
    const metrics = [['Website sessions',count('page_view')],['Collection click sessions',count('explore_click')],['Work viewing sessions',count('work_view')],['Image inspection sessions',summary.photoActivity?.sessions || 0],['3D viewer sessions',summary.modelActivity?.model_view || 0],['3D interaction sessions',summary.modelActivity?.model_interaction || 0],['Inquiries received',summary.inquiries]];
    $('#metrics').replaceChildren(...metrics.map(([label,value]) => { const item = el('div','metric'); item.append(el('span','',label),el('strong','',String(value))); return item; }));
    $('#funnel').replaceChildren(...summary.funnel.map(step => {
      const row = el('div','funnel-row'),track = el('div','funnel-track'),fill = el('div','funnel-fill');
      const percent = count('page_view') ? Math.round(step.sessions / count('page_view') * 100) : 0;
      fill.style.width = Math.min(100,percent) + '%'; track.append(fill);
      const value = el('div','funnel-value',String(step.sessions)); value.append(el('small','',percent + '%'));
      row.append(el('span','',labels[step.name]),track,value); return row;
    }));
    $('#works').replaceChildren(...summary.works.map(work => { const row = el('tr'); for (const value of [work.title,work.views,work.sessions,work.inquiries]) row.append(el('td','',String(value))); return row; }));
    if (!summary.works.length) { const row = el('tr'),cell = el('td','empty','No work views yet.'); cell.colSpan = 4; row.append(cell); $('#works').append(row); }
    $('#sources').replaceChildren(...summary.sources.map(source => { const row = el('tr'); row.append(el('td','',source.source),el('td','',String(source.sessions))); return row; }));
    if (!summary.sources.length) { const row = el('tr'),cell = el('td','empty','No measured visits yet.'); cell.colSpan = 2; row.append(cell); $('#sources').append(row); }
    $('#email-status').textContent = summary.emailConfigured ? 'Inquiries are saved here first. Email notifications are enabled; each inquiry shows its notification status.' : 'Inquiries are saved here. Email notifications still need a sender address, recipient address, and email provider key.';
    $('#inbox').replaceChildren(...inquiries.map(item => {
      const article = el('article','inquiry'),head = el('div','inquiry-head');
      head.append(el('h3','',item.name),el('p','',new Date(item.created_at).toLocaleString()));
      const email = el('a','',item.email); email.href = 'mailto:' + item.email;
      const meta = el('div','meta'); meta.append(el('span','',item.interest),el('span','',notifications[item.notification] || item.notification),el('span','',item.source || 'Direct / unknown'));
      article.append(head,email,el('p','topic',item.topic));
      if (item.message) article.append(el('p','message',item.message));
      article.append(meta,el('p','meta','Reference: ' + item.id)); return article;
    }));
    if (!inquiries.length) $('#inbox').append(el('p','empty','No inquiries yet. New submissions will appear here.'));
    $('#status').textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch(error) { $('#status').textContent = error.message; $('#status').setAttribute('role','alert'); }
  finally { $('#refresh').disabled = false; }
}
$('#refresh').addEventListener('click',load); $('#period').addEventListener('change',load); load();
