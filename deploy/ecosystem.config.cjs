
module.exports = {
  apps : [{
    name   : "lensforge-api",
    script : "./engine/dist/index.js",
    cwd    : "/var/www/lensforge/app",
    watch  : false,
    env    : {
      "NODE_ENV": "production",
    }
  }]
}

