import fs from 'fs';
import path from 'path';

const gradlewPath = path.join(process.cwd(), 'android', 'gradlew');

try {
  if (fs.existsSync(gradlewPath)) {
    fs.chmodSync(gradlewPath, 0o755);
    console.log('Successfully set executable permissions for android/gradlew');
  } else {
    console.error('android/gradlew not found');
  }
} catch (error) {
  console.error('Error setting permissions:', error);
  process.exit(1);
}
