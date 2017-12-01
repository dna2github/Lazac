using System;
#define DEBUG

namespace Test {
   class Test {
      public delegate int test_t(int i);
      static void Main(string[] args) {
         test_t a1 = x => 1;
         test_t a2 = (x) => { return 2; };
         Console.WriteLine(@"hello
         world");
         Console.WriteLine("hello world");
         A1 a3 = new A1();
      }
   }

   public class A1 {
      [Condition("DEBUG")]
      public int test() { return 0; }

      public int a1<T>(T x) where T : System.IComparable<T> {
         try {
         } catch (Exception e) when (e.check()) {}
         return 1;
      }

      public A1 operator+(A1 x) {
         return x;
      }

      #region this is public
      public string this[int index] {
         get {
            string tmp;
            if(index >= 0 && index <= size-1) tmp = namelist[index]; else tmp = "";
            return tmp;
         }
         set {
            if(index >= 0 && index <= size-1) namelist[index] = value;
         }
      }
      #endregion
   }
}