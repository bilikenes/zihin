; Kurulumdan sonra kısayollara ikonu açıkça yazar ve Windows'a ikonların değiştiğini bildirir.
; Böylece ikon değişen sürümlerde masaüstü/Başlat kısayolu eski ikonu önbellekten göstermez.
!macro NSIS_HOOK_POSTINSTALL
  IfFileExists "$DESKTOP\${PRODUCTNAME}.lnk" 0 +2
    CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
  IfFileExists "$SMPROGRAMS\${PRODUCTNAME}.lnk" 0 +2
    CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
  ; SHCNE_ASSOCCHANGED: ikon önbelleğini yenile
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
