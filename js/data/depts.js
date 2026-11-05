// 部门与岗位定义：独立成数据模块，避免 org.js 与 state.js 互相引用
export const DEPT_DEFS = [
  { id: 'rnd', name: '研发部', icon: '⚙', color: '#4aa3ff', desc: '决定科技研发速度与自研零件能力。' },
  { id: 'design', name: '工业设计部', icon: '✎', color: '#c47cf0', desc: '影响手机外观评分与设计上限。' },
  { id: 'prod', name: '生产部', icon: '⚒', color: '#f5a542', desc: '影响产量、良品率与单位制造成本。' },
  { id: 'qa', name: '质量管理部', icon: '✓', color: '#37c9a5', desc: '降低故障率与售后成本。' },
  { id: 'supply', name: '供应链部', icon: '⇄', color: '#8fbf4a', desc: '降低采购成本、缩短交期。' },
  { id: 'mkt', name: '市场部', icon: '📣', color: '#f56b8f', desc: '提升品牌热度与新品曝光。' },
  { id: 'sales', name: '销售部', icon: '¥', color: '#e0c14a', desc: '提升渠道覆盖与终端销量。' },
  { id: 'fin', name: '财务部', icon: '▤', color: '#7f8fa6', desc: '影响融资成本与预算效率。' },
  { id: 'hr', name: '人力资源部', icon: '☺', color: '#9b8cff', desc: '影响招聘质量与员工满意度。' },
];

export const ROLE_BY_DEPT = {
  rnd: ['工程师', '高级工程师', '技术专家'],
  design: ['设计师', '高级设计师', '设计总监'],
  prod: ['生产专员', '生产主管', '厂长'],
  qa: ['测试员', '质量工程师', '质量经理'],
  supply: ['采购专员', '采购经理', '供应链总监'],
  mkt: ['市场专员', '品牌经理', '市场总监'],
  sales: ['销售代表', '区域经理', '销售总监'],
  fin: ['会计', '财务经理', '财务总监'],
  hr: ['人事专员', '招聘经理', '人事总监'],
  exec: ['CEO', 'CTO', 'COO', 'CFO', 'CMO'],
};
