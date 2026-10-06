const fs = require('fs');
const path = 'apps/api/src/app.module.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  "import { TutorModule } from './modules/tutor/tutor.module';",
  "import { TutorModule } from './modules/tutor/tutor.module';\nimport { TutorHrModule } from './modules/tutor-hr/tutor-hr.module';"
);

content = content.replace(
  "TutorModule,",
  "TutorModule,\n    TutorHrModule,"
);

fs.writeFileSync(path, content);
console.log('app.module.ts updated');
