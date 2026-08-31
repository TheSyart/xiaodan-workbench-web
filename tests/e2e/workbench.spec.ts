import { expect, test } from '@playwright/test';

test('loads every primary module under the configured base path',async({page})=>{
  await page.goto('./');await expect(page.getByRole('heading',{name:'把今天过清楚'})).toBeVisible();
  for(const [label,heading] of [['记账','每一笔，都有来处'],['日历','让时间有形状'],['项目','让长期事情看得见']] as const){
    await page.getByRole('link',{name:new RegExp(label)}).click();await expect(page.getByRole('heading',{name:heading})).toBeVisible();
  }
  await page.reload();await expect(page.getByRole('heading',{name:'让长期事情看得见'})).toBeVisible();
});

test('creates a content series, previews a weekly batch and opens CodeMirror',async({page},testInfo)=>{
  await page.goto('./projects');await page.getByRole('button',{name:'新建项目'}).click();
  const suffix=testInfo.project.name.replace('desktop-','');
  await page.getByLabel('项目名称').fill(`浏览器系列 ${suffix}`);await page.getByLabel('项目说明').fill('E2E 系列');
  await page.getByLabel('目标观众').fill('普通读者');await page.getByLabel('选题范围').fill('AI 科普');
  await page.getByLabel('语气规范').fill('通俗直接');await page.getByLabel('结构模板').fill('问题—比喻—结论');
  await page.getByRole('button',{name:'创建项目'}).click();await page.getByRole('button',{name:'内容日历'}).click();
  await page.getByRole('button',{name:'批量创建空稿'}).click();await page.getByRole('button',{name:'预览日期与标题'}).click();
  await expect(page.getByText(/将创建 \d+ 篇/)).toBeVisible();await page.getByRole('button',{name:'确认并一次创建'}).click();
  await page.getByRole('link',{name:/稿件/}).click();await expect(page.locator('.cm-content')).toBeVisible();
  await page.locator('.cm-content').fill('第一行\n\n第二个节拍\n');await expect(page.getByText(/已保存/)).toBeVisible({timeout:4_000});
  await page.reload();await expect(page.locator('.cm-content')).toContainText('第二个节拍');
});

