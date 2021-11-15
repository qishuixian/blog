// src/index.js
const Koa = require('koa');
const Router = require('koa-router');
const mime = require('mime');
const fs = require('fs-extra');
const Path = require('path');
const crypto = require('crypto');

const app = new Koa();
const router = new Router();

// 处理首页
router.get(/(^\/static\/index(.html)?$)|(^\/$)/, async (ctx, next) => {
  ctx.type = mime.getType('.html');

  const content = await fs.readFile(Path.resolve(__dirname, './static/index.html'), 'UTF-8');
  ctx.body = content;

  await next();
});

// 处理图片,强制性缓存
router.get(/\S*\.(jpe?g|png)$/, async (ctx, next) => {
  const { path } = ctx;
  ctx.type = mime.getType(path);
  // Expires:缓存过期时间，用来指定资源到期的时间，是服务器端的具体的时间点。
  ctx.set('expires', new Date(Date.now() + 30000).toUTCString())
  /* Cache-Control
     public:表示响应可以被客户端和代理服务器缓存
     private:表示响应可以被客户端缓存、
     max-age=1000:缓存30秒后就过期，需要重新请求。
     s-max-age=1000:覆盖max-age，作用一样，只是在代理服务器生效
     no-store:不缓存任何响应
     no-cache: 资源被缓存，但是立即失效，下次会发起请求验证资源是否过期。
     max-stale=1000:1000秒内，即使缓存过期，也使用该缓存
     max-fresh=1000:希望在1000秒内获取最新的响应
   */
  ctx.set('cache-control', 'no-cache,public,max-age=1000');
  const imageBuffer = await fs.readFile(Path.resolve(__dirname, `.${path}`));
  ctx.body = imageBuffer;

  await next();
});

const responseFile = async (path, context, encoding) => {
  const fileContent = await fs.readFile(path, encoding);
  context.type = mime.getType(path);
  context.body = fileContent;
};

// 处理 css 文件 last-modified 配置协商缓存
router.get(/\S*\.css$/, async (ctx, next) => {
  const { request, response, path } = ctx;
  response.set('pragma', 'no-cache');
  const cssPath = Path.resolve(__dirname, `.${path}`);
  const ifModifiedSince = request.headers['if-modified-since'];
  const cssStatus = await fs.stat(cssPath);
  const lastModified = cssStatus.mtime.toGMTString();
  if (ifModifiedSince === lastModified) {
    response.status = 304;
  } else {
    response.lastModified = lastModified;
    await responseFile(cssPath, ctx);
  }
  await next();
});

// 处理 js 文件 使用 etag 配置协商缓存
router.get(/\S*\.js$/, async (ctx, next) => {
  const { request, response, path } = ctx;
  ctx.type = mime.getType(path);
  response.set('pragma', 'no-cache');

  const ifNoneMatch = request.headers['if-none-match'];
  const jsPath = Path.resolve(__dirname, `.${path}`);
  const hash = crypto.createHash('md5');
  const jsBuffer = await fs.readFile(jsPath);
  hash.update(jsBuffer);
  const etag = `"${hash.digest('hex')}"`;
  if (ifNoneMatch === etag) {
    response.status = 304;
  } else {
    response.set('etag', etag);
    await responseFile(jsPath, ctx);
  }

  await next();
});

app
  .use(router.routes())
  .use(router.allowedMethods());


app.listen(3003);
process.on('unhandledRejection', (err) => {
  console.error('有 promise 没有 catch', err);
});
