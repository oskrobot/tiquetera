# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npm run start:lan
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Scripts útiles para conexión desde celular (Expo Go)

- `npm run start:lan`: usa la red local (misma WiFi entre laptop y celular).
- `npm run start:tunnel`: usa túnel de Expo (útil si la red bloquea conexiones locales).
- `npm run start:localhost`: solo para emulador/simulador en la misma máquina.

## Solución rápida al error "Could not connect to development server"

Si Expo Go muestra una URL como `*.exp.direct` y no conecta:

1. Cierra Expo Go en el celular (forzar cierre).
2. En la computadora, detén Metro y reinícialo limpio:

   ```bash
   npx expo start --tunnel --clear
   ```

   o con scripts:

   ```bash
   npm run start:tunnel -- --clear
   ```

3. Escanea nuevamente el QR desde Expo Go.
4. Si sigue fallando, cambia de modo:
   - Si estabas en `tunnel`, prueba `npm run start:lan`.
   - Si estabas en `lan`, prueba `npm run start:tunnel`.
5. Verifica que:
   - celular y laptop estén en la misma WiFi (sin red de invitados),
   - no haya VPN activa,
   - firewall/antivirus no esté bloqueando Node/Expo.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
