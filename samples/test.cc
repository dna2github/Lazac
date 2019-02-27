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

namespace X1 {
   class X2 {
      public:
      X2();
      bool operator == (const X1::X2&);
      int hwnd;
   };
}

using namespace X1;

class A;

class C {};
class A : public C {};
namespace ns {
   class A1 {};
}

namespace XX1 {}

::X1::X2::X2() : hwnd(0) {}

bool
::X1 :: X2::operator == (const X1::X2& rhs)
{
   if (true) {
      this->hwnd = 0;
   }
   return this->hwnd == rhs.hwnd;
}

class ::X2* f0() {
   return 0;
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
int mainx () {
   return 2;
}

/*
   a() {  }            /---> } 
          region: x1   |     region: x2
      startIndex: a1   | startIndex: a2
        endIndex: b1   |   endIndex: b2
           chain: -----/
 */

#include <algorithm>
#include <cmath>

void abssort(float* x, unsigned n) {
    std::sort(x, x + n,
        // Lambda expression begins
        [](float a, float b) {
            return (std::abs(a) < std::abs(b));
        } // end of lambda expression
    );
}