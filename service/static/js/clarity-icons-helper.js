(function(document, window){
   if (!window.ClarityIcons) return;
   document.querySelectorAll('.clr-icon').forEach(function (elem) {
      var icon_name = null;
      for(var i = elem.classList.length-1; i >= 0; i--) {
         if (elem.classList[i] !== 'clr-icon') {
            icon_name = elem.classList[i];
            break;
         }
      }
      if (!icon_name) return;
      try {
         elem.innerHTML = ClarityIcons.get(icon_name);
         var svg = elem.children[0];
         var size = parseInt(elem.getAttribute('size')) || 32;
         svg.setAttributeNS(null, 'width', size);
         svg.setAttributeNS(null, 'height', size);
      } catch (e) {}
   });
})(document, window);
