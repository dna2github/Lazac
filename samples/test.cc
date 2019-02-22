#include <stdio.h>
#include "stdlib.h"

#define XAA
#define PI ( \
   3.14159265358979323846264338\
)
#define hello(x, y) ((x)>(y)?#x:#y)
#define BNAME(x) a(x)
#define ANAME(x) BNAME(x)
#line 13 "Xaaaa"
#pragma warnings("hello world")

class C {};
class A : public C {};
namespace ns {
   class A1 {};
}

namespace X1 {
   class X2 {
      public:
      bool operator == (const X1::X2&);
      int hwnd;
   };
}

bool
X1::X2::operator == (const X1::X2& rhs)
{
   return this->hwnd == rhs.hwnd;
}

int test(int x) {
   return 0;
}

int (*f ())(int) {
   return test;
}

int ANAME(int x) {

# ifdef PI
   return 0;
#endif
}

#ifdef XXXX
#define PPP
#endif

int main () {
   return 1;
}
#undef XAA
int main () {
   return 2;
}

/*
   a() {  }            /---> } 
          region: x1   |     region: x2
      startIndex: a1   | startIndex: a2
        endIndex: b1   |   endIndex: b2
           chain: -----/
 */