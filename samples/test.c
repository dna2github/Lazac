#include \
   <stdio.h>

#define A } \
          test
#define B this is a \
         test
#undef A

#define C teststruct struct

int main(int, const char**);

struct __name1__ {
   int test;
   struct __name2__ {
      int b;
   } p;
};

typedef int (TEST_t);

typedef int (*name2_1)(int, int);

typedef struct {
   int b;
} *name3;

typedef struct {
   int b;
} name4[10];

static struct tx1 { int a; int b; }** t1() { return 0; }
extern struct __name1__******* t2() { return 0; }

int a(int x) { return x; }

int (*f1())(int) { return a; }
int (*f2(struct {
   int test;
} x))(int) { return a; }

struct x1a {
   int a;
} m0 () {}

m1 () {} m2 () {}

int main(int argc, const char ** argv) {
   return 0;
}